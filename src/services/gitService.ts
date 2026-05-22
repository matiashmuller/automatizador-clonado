import { execSync } from "child_process";
import { config } from "../config"; // Importamos el objeto centralizado

export async function fetchReposForUsers(usernames: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  
  if (config.GITHUB_TOKEN) headers["Authorization"] = `Bearer ${config.GITHUB_TOKEN}`;

  const usernameSet = new Set(usernames.map((u) => u.toLowerCase()));

  if (config.GITHUB_ORG) {
    const prefix = config.PARCIAL_PREFIX.toLowerCase();
    console.log(`\n🔍 Buscando repos en org "${config.GITHUB_ORG}" con prefijo "${config.PARCIAL_PREFIX}"...`);
    let page = 1;
    let found = 0;
    let totalCount = 0;

    while (true) {
      const res = await fetch(
        `https://api.github.com/search/repositories?q=${encodeURIComponent(prefix)}+org:${config.GITHUB_ORG}&per_page=100&page=${page}`,
        { headers },
      );
      if (!res.ok) {
        console.error(`GitHub API error: ${res.status} ${await res.text()}`);
        break;
      }
      const data: any = await res.json();
      const repos: any[] = data.items ?? [];
      totalCount = data.total_count;
      if (!repos.length) break;

      for (const repo of repos) {
        const name: string = repo.name.toLowerCase();
        if (!name.startsWith(prefix)) continue;
        const suffix = name.slice(prefix.length + 1);
        if (usernameSet.has(suffix)) {
          found++;
          result.set(suffix, repo.clone_url);
        }
      }
      page++;
      if (repos.length < 100) break;
    }
    console.log(`  🔎 Repos en org con ese prefijo: ${totalCount}`);
    console.log(`  ✅ Encontrados: ${found} / ${usernames.length}`);
  } else {
    console.log(`\n🔍 Buscando repos por usuario (sin org)...`);
    await Promise.all(
      usernames.map(async (username) => {
        const repoName = `${config.PARCIAL_PREFIX}-${username}`;
        const res = await fetch(
          `https://api.github.com/repos/${username}/${repoName}`,
          { headers },
        );
        if (res.status === 200) {
          const repo = await res.json();
          result.set(username.toLowerCase(), repo.clone_url);
        }
      }),
    );
  }
  return result;
}

export function cloneRepo(cloneUrl: string, targetDir: string): boolean {
  try {
    const urlWithAuth = config.GITHUB_TOKEN && cloneUrl.startsWith("https://")
        ? cloneUrl.replace("https://", `https://${config.GITHUB_TOKEN}@`)
        : cloneUrl;

    execSync(`git clone --progress "${urlWithAuth}" "${targetDir}"`, {
      stdio: ["ignore", "ignore", "inherit"],
    });
    return true;
  } catch (e) {
    console.error(`    ❌ Error clonando: ${(e as Error).message?.split("\n")[0]}`);
    return false;
  }
}