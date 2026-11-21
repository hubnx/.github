/**
 * The contributor license agreement's checks, for every HubNX repository that takes outside pull requests. Run by
 * .github/workflows/cla.yml, which each repository calls pinned to a commit, from this repository's code at that
 * commit, never a pull request's: on a pull request, every commit author must have signed (or be exempt); on a comment
 * that is exactly the sentence, the commenter's signature is added to signatures/cla.json on this repository's
 * `cla-signatures` branch. One list for every repository, since the agreement covers every product HubNX owns or
 * manages. The rules are the functions below, tested; the rest reads and writes through `gh` and `git`. Adapted from
 * hubnx Agent's (2026-11-19), shared from 2026-11-21.
 *
 *   node cla/cla.ts check   (env: GH_TOKEN, REPO, PR, CONTACT, AGREEMENT_REPO, AGREEMENT_COMMIT, SIGNATURES)
 *   node cla/cla.ts sign    (the same, and COMMENT_ID, COMMENTER, COMMENTER_ID, BODY, SIGNATURES_KEY_SET; SIGNATURES must
 *                            be able to push)
 *
 * SIGNATURES is a checkout of the `cla-signatures` branch.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

/** The one sentence that signs, as the comment asks for it. */
export const signingSentence = "I have read the CLA and I agree to it.";
const marker = "<!-- hubnx-cla -->";

/** Where the agreements a signer is shown live: this repository, at the commit the caller's workflow pinned. */
export type Agreement = { readonly repository: string; readonly commit: string; readonly contact: string };

export function askComment(agreement: Agreement): string {
  const at = `https://github.com/${agreement.repository}/blob/${agreement.commit}/cla`;
  return `${marker}\nThanks for this! Before it can be merged, please post this comment once: ${signingSentence}\n\nThe CLA: [individual](${at}/individual.md) · signing for a company: [corporate](${at}/corporate.md), emailed to ${agreement.contact}. One signature covers every HubNX repository.`;
}

export type Signature = {
  readonly login: string;
  readonly id: number;
  readonly signedAt: string;
  readonly comment: string;
  readonly repository: string;
  readonly pullRequest: number;
  /** The commit of this repository whose agreements the signer was shown. */
  readonly agreement: string;
};
export type Signatures = { readonly signed: readonly Signature[] };
/** Exempt by an explicit list, never guessed from a name: bots by login, companies whose Corporate CLA is on file by member login. */
export type Exempt = { readonly bots: readonly string[]; readonly corporate: readonly string[] };
/** A commit's author: a GitHub account, or an address no account is linked to. */
export type Author = { readonly login: string | null; readonly email: string };

/** Whether a comment signs: the sentence alone, its spacing at either end aside. */
export function signs(body: string): boolean {
  return body.trim() === signingSentence;
}

/** Who still has to sign, in words a person reads: by login, or by address when the commit isn't linked to an account. */
export function unsigned(authors: readonly Author[], signatures: Signatures, exempt: Exempt, canWrite: (login: string) => boolean): string[] {
  const signed = new Set(signatures.signed.map((signature) => signature.login.toLowerCase()));
  const listed = new Set([...exempt.bots, ...exempt.corporate].map((login) => login.toLowerCase()));
  const missing = new Set<string>();
  for (const author of authors) {
    if (author.login === null) missing.add(`${author.email} (a commit not linked to a GitHub account)`);
    else if (!signed.has(author.login.toLowerCase()) && !listed.has(author.login.toLowerCase()) && !canWrite(author.login)) missing.add(`@${author.login}`);
  }
  return [...missing];
}

/** The signatures with one more, kept once per account however often, and wherever, it signs. */
export function withSignature(signatures: Signatures, signature: Signature): Signatures {
  if (signatures.signed.some((each) => each.id === signature.id)) return signatures;
  return { signed: [...signatures.signed, signature] };
}

const branch = "cla-signatures";
const file = path.join("signatures", "cla.json");
/** Pushes from several repositories can cross: each retry starts again from the branch as it now is. */
const pushAttempts = 5;

export function readSignatures(checkout: string): Signatures {
  return JSON.parse(readFileSync(path.join(checkout, file), "utf8")) as Signatures;
}

function git(checkout: string, args: readonly string[]): void {
  // Piped, so a failure's message (a push refused, say) travels in the error.
  execFileSync("git", ["-C", checkout, ...args], { stdio: "pipe" });
}

/** Adds a signature to the checkout's list and pushes it, starting again from the branch when another push got there
 * first. Returns the list as pushed (unchanged when the account had signed already). */
export function recordSignature(checkout: string, signature: Signature): Signatures {
  for (let attempt = 1; ; attempt++) {
    const signatures = readSignatures(checkout);
    const next = withSignature(signatures, signature);
    if (next === signatures) return signatures;
    writeFileSync(path.join(checkout, file), `${JSON.stringify(next, null, 2)}\n`);
    git(checkout, ["-c", "user.name=github-actions[bot]", "-c", "user.email=41898282+github-actions[bot]@users.noreply.github.com",
      "commit", "-q", "-m", `CLA signed by @${signature.login} on ${signature.repository}#${signature.pullRequest}`, "--", file]);
    try {
      git(checkout, ["push", "-q", "origin", `HEAD:${branch}`]);
      return next;
    } catch (error) {
      if (attempt >= pushAttempts) throw new Error(`CLA_SIGNATURE_NOT_PUSHED after ${attempt} attempts`, { cause: error });
      git(checkout, ["fetch", "-q", "origin", branch]);
      git(checkout, ["reset", "-q", "--hard", "FETCH_HEAD"]);
    }
  }
}

function gh(args: readonly string[]): string {
  return execFileSync("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function ghJson<T>(args: readonly string[]): T {
  return JSON.parse(gh(["api", ...args])) as T;
}

function canWriteIn(repo: string): (login: string) => boolean {
  return (login) => {
    try {
      return ["admin", "maintain", "write"].includes(ghJson<{ permission: string }>([`repos/${repo}/collaborators/${login}/permission`]).permission);
    } catch {
      // Not a collaborator: GitHub answers 404, and someone without access has to sign.
      return false;
    }
  };
}

function check(repo: string, pr: number, signatures: Signatures, agreement: Agreement): void {
  const authors = ghJson<{ author: { login: string } | null; commit: { author: { email: string } } }[]>(["--paginate", `repos/${repo}/pulls/${pr}/commits`]).map((each) => ({ login: each.author?.login ?? null, email: each.commit.author.email }));
  const exempt = JSON.parse(readFileSync(path.join(import.meta.dirname, "exempt.json"), "utf8")) as Exempt;
  const missing = unsigned(authors, signatures, exempt, canWriteIn(repo));
  const head = ghJson<{ head: { sha: string } }>([`repos/${repo}/pulls/${pr}`]).head.sha;
  gh(["api", "-X", "POST", `repos/${repo}/statuses/${head}`, "-f", "context=CLA", "-f", `state=${missing.length === 0 ? "success" : "pending"}`, "-f", `description=${missing.length === 0 ? "Everyone has signed the CLA" : `Waiting for: ${missing.join(", ")}`.slice(0, 140)}`]);
  if (missing.length === 0) return;
  const comments = ghJson<{ body: string }[]>(["--paginate", `repos/${repo}/issues/${pr}/comments`]);
  if (!comments.some((comment) => comment.body.includes(marker))) gh(["api", "-X", "POST", `repos/${repo}/issues/${pr}/comments`, "-f", `body=${askComment(agreement)}`]);
}

function sign(repo: string, pr: number, checkout: string, agreement: Agreement, environment: NodeJS.ProcessEnv): void {
  if (!signs(environment["BODY"] ?? "")) return;
  if (environment["SIGNATURES_KEY_SET"] !== "true") {
    throw new Error(`CLA_SIGNATURES_KEY_MISSING: ${repo} has no CLA_SIGNATURES_KEY secret, so the signature can't be recorded; run hubnx/.github's cla/add-repo.sh for it (README.md › Use it in a repository, step 2), then re-run this job`);
  }
  const signature: Signature = {
    login: environment["COMMENTER"] ?? "",
    id: Number(environment["COMMENTER_ID"]),
    signedAt: new Date().toISOString(),
    comment: `https://github.com/${repo}/pull/${pr}#issuecomment-${environment["COMMENT_ID"]}`,
    repository: repo,
    pullRequest: pr,
    agreement: agreement.commit,
  };
  if (!signature.login || !Number.isInteger(signature.id)) throw new Error("CLA_INPUT: COMMENTER and COMMENTER_ID are needed to sign");
  check(repo, pr, recordSignature(checkout, signature), agreement);
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  const repo = process.env["REPO"] ?? "";
  const pr = Number(process.env["PR"]);
  const checkout = process.env["SIGNATURES"] ?? "";
  const agreement: Agreement = { repository: process.env["AGREEMENT_REPO"] ?? "", commit: process.env["AGREEMENT_COMMIT"] ?? "", contact: process.env["CONTACT"] ?? "" };
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo) || !Number.isInteger(pr)) throw new Error("CLA_INPUT: REPO and PR are needed");
  if (!checkout || !agreement.repository || !/^[0-9a-f]{40}$/.test(agreement.commit) || !agreement.contact.includes("@")) {
    throw new Error("CLA_INPUT: SIGNATURES, AGREEMENT_REPO, AGREEMENT_COMMIT (a full commit SHA) and CONTACT are needed");
  }
  if (process.argv[2] === "check") check(repo, pr, readSignatures(checkout), agreement);
  else if (process.argv[2] === "sign") sign(repo, pr, checkout, agreement, process.env);
  else throw new Error(`CLA_COMMAND: "${process.argv[2] ?? ""}" isn't check or sign`);
}
