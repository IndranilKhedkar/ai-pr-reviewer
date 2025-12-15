import "dotenv/config";
import express from "express";
import { getPrMetadata } from "./utils/prMetadata.js";
import {
  fetchPR,
  fetchPrComments,
  fetchPrDiff,
  postReviewComments,
  uploadCodeInsights,
} from "./services/bitbucket.js";
import { loadPrompt } from "./services/prompt.js";
import { fetchPrReviewComments } from "./services/vertex.js";

const PORT = process.env.PORT || 3000;
const app = express();

app.use(express.json());

console.log(Object.keys(process.env));

app.get("/api/health-check", async (req, res) => {
  res.json({ message: "OK ✔️" });
});

app.post("/api/webhook/pr", async (req, res) => {
  const event = req.headers["x-event-key"];

  console.log(`Received Bitbucket webhook: ${event}`);
  console.log(JSON.stringify(req.body, null, 2));

  if (event === "pullrequest:created") {
    const pr = req.body.pullrequest;
    const repo = req.body.repository;

    console.log("New Pull Request Created!");
    console.log(`Repo: ${repo.full_name}`);
    console.log(`Title: ${pr.title}`);
    console.log(`Author: ${pr.author.display_name}`);
    console.log(`URL: ${pr.links.html.href}`);

    await doPrReview(repo?.full_name, pr?.id);
  }

  res.json({ message: `${event} webhook received.` }).status(200);
});

app.post("/api/review/pr", async (req, res) => {
  await doPrReview(req.body.repo, req.body.prId);
  res.json({ message: "PR review completed successfully." });
});

app.listen(PORT, () => {
  console.log(`AI reviewer listening on port ${PORT}`);
});

async function doPrReview(repo, prId) {
  const prDetails = await fetchPR(repo, prId);

  console.log("prDetails", prDetails);

  // 1. Load PR metadata
  var prMetadata = getPrMetadata(prDetails);

  // 2. Load PR diff
  prMetadata.diff = await fetchPrDiff(prMetadata.repoSrc, prMetadata.prId);
  if (!prMetadata.diff) {
    console.log("No diff detected — exiting.");
    return;
  }

  console.log(
    `PR ID=${prMetadata.prId}\nSource=${prMetadata.repoSrc}@${prMetadata.srcBranch}\nDestination=${prMetadata.repoDst}@${prMetadata.dstBranch}`
  );

  // 3. Load existing comments
  const existingCommentsSet = await fetchPrComments(
    prMetadata.repoSrc,
    prMetadata.prId
  );

  // 4. Load prompt
  const { prompt, genCfg } = loadPrompt(prMetadata);

  // 5. Generate review comments
  const aiJson = await fetchPrReviewComments(prompt, genCfg);
  const reviewComments = aiJson.reviewComments ?? aiJson;

  // 6. Post inline comments
  const { annotations, hasCriticalIssue } = await postReviewComments(
    prMetadata,
    reviewComments,
    existingCommentsSet
  );

  // 7. Upload Code Insights (report + annotations)
  await uploadCodeInsights(prMetadata, annotations);

  // 9. Fail build on critical issues
  if (hasCriticalIssue) {
    console.error("🚨 Critical issues detected — failing build.");
  } else {
    console.log("✔ Done — no critical issues.");
  }
}
