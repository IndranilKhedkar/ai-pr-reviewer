export function getPrMetadata(prDetails) {
  // const json = event || JSON.parse(fs.readFileSync("./data/combined_data.json", "utf8"));

  return {
    prId: prDetails?.id,
    repoSrc: prDetails?.source?.repository?.full_name ?? "",
    repoDst: prDetails?.destination?.repository?.full_name ?? "",
    srcBranch: prDetails?.source?.branch?.name ?? "",
    dstBranch: prDetails?.destination?.branch?.name ?? "",
    srcCommit: prDetails?.source?.commit?.hash ?? "",
  };
}
