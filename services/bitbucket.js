import axios from "axios";
import { fingerprint } from "../utils/hash.js";

export async function makeBitBucketRequest(method, url, data) {
  let backoff = 2000;

  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const repoName = extractRepoName(url);
      const resp = await axios({
        method,
        url,
        data,
        headers: getHeaders(getTheAccessToken(repoName)),
        validateStatus: () => true,
      });

      if (resp.status >= 200 && resp.status < 300) return resp;

      if (resp.status === 429 || resp.status >= 500) {
        console.log(`⏳ Retry ${attempt}: ${resp.status}`);
        await new Promise((r) => setTimeout(r, backoff));
        backoff *= 2;
        continue;
      }

      return resp;
    } catch (err) {
      console.error(`Error on attempt ${attempt}:`, err.message);
      if (attempt === 5) throw err;
      await new Promise((r) => setTimeout(r, backoff));
      backoff *= 2;
    }
  }
}

export async function fetchPR(repo, prId) {
  try {
    const url = `https://api.bitbucket.org/2.0/repositories/${repo}/pullrequests/${prId}`;
    const res = await makeBitBucketRequest("GET", url);
    return res.data;
  } catch (err) {
    console.error("Error fetching pull request details:", err.message);
    return null;
  }
}

export async function fetchPrComments(repoDst, prId) {
  const existingCommentsSet = new Set();
  let url = `https://api.bitbucket.org/2.0/repositories/${repoDst}/pullrequests/${prId}/comments?pagelen=100`;

  // if (ENV.BOT_UUID) {
  //   url += `&q=user.uuid="${ENV.BOT_UUID}"`;
  // }

  while (url) {
    const resp = await makeBitBucketRequest("GET", url);

    for (const c of resp.data.values ?? []) {
      const match = c?.content?.raw?.match(/<!--\s*gemini:([0-9a-f]{12})/);
      if (match) {
        existingCommentsSet.add(match[1]);
      }
    }

    url = resp.data.next;
  }

  console.log(`✔ Found ${existingCommentsSet.size} existing comments.`);

  return existingCommentsSet;
}

export async function fetchPrDiff(repoDst, prId) {
  try {
    const url = `https://api.bitbucket.org/2.0/repositories/${repoDst}/pullrequests/${prId}/diff`;
    const res = await makeBitBucketRequest("GET", url);
    return res.data;
  } catch (err) {
    console.error("Error fetching pull request diff: ", err.message);
    return null;
  }
}

export async function uploadCodeInsights(data, annotations) {
  if (annotations.length === 0) return;

  const REPORT_ID = "gemini-ai-review";
  const url = `https://api.bitbucket.org/2.0/repositories/${data.repoSrc}/commit/${data.srcCommit}/reports/${REPORT_ID}`;

  const payload = {
    title: "Gemini AI Code Review",
    details: `Found ${annotations.length} issues.`,
    report_type: "BUG",
    reporter: "CI",
    result: "PASSED",
    data: [
      { title: "Issues Found", type: "NUMBER", value: annotations.length },
    ],
  };

  await makeBitBucketRequest("PUT", url, payload);
  await makeBitBucketRequest("POST", `${url}/annotations`, annotations);
}

export async function postReviewComments(data, comments, existingCommentsSet) {
  const seen = {};
  const annotations = [];
  let hasCriticalIssue = false;

  const url = `https://api.bitbucket.org/2.0/repositories/${data.repoSrc}/pullrequests/${data.prId}/comments`;

  for (const item of comments) {
    const {
      file,
      line,
      comment,
      severity = (item.severity ?? "info").toLowerCase(),
    } = item;

    if (!Number.isInteger(line)) {
      continue;
    }

    const fp = fingerprint(file, line);

    // dedupe logic
    if (existingCommentsSet.has(fp)) {
      continue;
    }
    if (seen[fp]) {
      continue;
    }

    // format comment
    const formatted = formatComment(fp, severity, comment);

    // post comment
    await makeBitBucketRequest("POST", url, {
      content: { raw: formatted },
      inline: { path: file, to: line },
    });

    // track annotation
    const annotation = buildAnnotation(fp, file, line, severity, comment);
    annotations.push(annotation);

    // track critical issues
    if (annotation.bbSev === "HIGH") {
      hasCriticalIssue = true;
    }

    seen[fp] = true;
  }

  return { annotations, hasCriticalIssue };
}

function formatComment(fp, severity, comment) {
  return `<!-- gemini:${fp} -->**AI Review | Severity: ${severity}**\n\n${comment}`;
}

function buildAnnotation(fp, file, line, severity, comment) {
  const sev = severity.toLowerCase();
  const bbSev = sev === "error" ? "HIGH" : sev === "warning" ? "MEDIUM" : "LOW";

  return {
    external_id: fp,
    annotation_type: "CODE_SMELL",
    path: file,
    line,
    summary: truncateWithEllipsis(comment, 400),
    severity: bbSev,
  };
}

function truncateWithEllipsis(str, maxLength) {
  const ending = "...";
  if (str.length > maxLength) {
    // Return the truncated string up to the maxLength, minus the length of the ending
    return str.slice(0, maxLength - ending.length) + ending;
  }
  return str;
}

function getTheAccessToken(repoName) {
  return process.env[`BITBUCKET_ACCESS_TOKEN_${repoName.toUpperCase()}`];
}

function getHeaders(accessToken) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${accessToken}`,
  };
}

function extractRepoName(urlString) {
  const url = new URL(urlString);
  const parts = url.pathname.split("/");
  console.log(`URL : ${urlString}, Repository Name : ${parts[4]}`);
  return parts[4];
}
