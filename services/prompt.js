import fs from "fs";

export function loadPrompt(data) {
  const cfg = JSON.parse(fs.readFileSync("./data/code-review.json", "utf8"));
  let prompt = cfg.prompt_template;
  const vars = {
    DIFF: data.diff,
    SRC_BRANCH: data.srcBranch,
    DST_BRANCH: data.dstBranch,
    JIRA_KEY: data.jiraKey,
  };

  for (const [key, value] of Object.entries(vars)) {
    prompt = prompt.replaceAll(`{{${key}}}`, value ?? "");
  }

  return { prompt, genCfg: cfg.generation_config };
}
