// The contributor license agreement's rules (cla.ts): what signs, who's exempt, who still has to sign, and how a
// signature reaches the one list when several repositories push at once.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { askComment, mustSign, readSignatures, recordSignature, signingSentence, signs, unsigned, withSignature, type Signature, type Signatures } from "./cla.ts";

const none: Signatures = { signed: [] };
const exempt = { bots: ["dependabot[bot]"], corporate: ["acme-dev"] };
const nobodyWrites = () => false;
const agreement = { repository: "hubnx/.github", commit: "0123456789abcdef0123456789abcdef01234567", contact: "video@hubnx.com" };

function signature(login: string, id: number, pullRequest = 1): Signature {
  return { login, id, signedAt: "2026-12-03T10:00:00Z", comment: `https://github.com/hubnx/video/pull/${pullRequest}#issuecomment-1`, repository: "hubnx/video", pullRequest, agreement: agreement.commit };
}

describe("the CLA", () => {
  it("signs only on the sentence itself, spacing aside: never on a comment that quotes or questions it", () => {
    expect(signs(signingSentence)).toBe(true);
    expect(signs(`  ${signingSentence}\n`)).toBe(true);
    expect(signs(`> ${signingSentence}`)).toBe(false);
    expect(signs(`${signingSentence} But I have a question.`)).toBe(false);
    expect(signs("i have read the cla and i agree to it.")).toBe(false);
  });

  it("asks everyone who hasn't signed, by login or by the address a commit isn't linked to an account with", () => {
    const authors = [{ login: "sam", id: 7, email: "sam@example.com" }, { login: null, id: null, email: "anon@example.com" }, { login: "sam", id: 7, email: "sam@example.com" }];
    expect(unsigned(authors, none, exempt, nobodyWrites)).toEqual(["@sam", "anon@example.com (a commit not linked to a GitHub account)"]);
  });

  it("exempts by the explicit list (bots, a company's people with its Corporate CLA on file) and write access, never by guessing from a name", () => {
    const authors = [{ login: "dependabot[bot]", id: 1, email: "x" }, { login: "acme-dev", id: 2, email: "y" }, { login: "maintainer", id: 3, email: "z" }, { login: "other[bot]", id: 4, email: "w" }];
    expect(unsigned(authors, none, exempt, (login) => login === "maintainer")).toEqual(["@other[bot]"]);
  });

  it("asks the account that opened the pull request too: a commit email borrowed from a signer or a bot doesn't sign for it", () => {
    const signed = withSignature(none, signature("ada", 1));
    const borrowed = [{ login: "ada", id: 1, email: "1+ada@users.noreply.github.com" }, { login: "dependabot[bot]", id: 2, email: "bot@example.com" }];
    expect(unsigned(mustSign({ login: "mallory", id: 9 }, borrowed), signed, exempt, nobodyWrites)).toEqual(["@mallory"]);
    expect(unsigned(mustSign({ login: "ada", id: 1 }, borrowed), signed, exempt, nobodyWrites)).toEqual([]);
  });

  it("counts a signature once per account, by its id: whichever repository it signed in, and after the account is renamed", () => {
    const one = withSignature(none, signature("Sam", 7));
    expect(withSignature(one, { ...signature("Sam", 7, 2), repository: "hubnx/music" })).toBe(one);
    expect(unsigned([{ login: "sam-renamed", id: 7, email: "x" }], one, exempt, nobodyWrites)).toEqual([]);
    expect(unsigned([{ login: "Sam", id: 8, email: "x" }], one, exempt, nobodyWrites)).toEqual(["@Sam"]);
  });

  it("asks in one friendly, clear line, with the sentence to post and the agreements at the commit the signer is shown", () => {
    const comment = askComment(agreement);
    expect(comment).toContain(`Thanks for this! Before it can be merged, please post this comment once: ${signingSentence}`);
    expect(comment).toContain(`https://github.com/hubnx/.github/blob/${agreement.commit}/cla/individual.md`);
    expect(comment).toContain("emailed to video@hubnx.com. One signature covers every HubNX repository.");
  });
});

describe("recording a signature in the one list (a git branch every repository pushes to)", () => {
  let folder: string;
  const run = (cwd: string, ...args: string[]) => execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", ...args], { cwd, stdio: "pipe" });
  const clone = (name: string) => {
    run(folder, "clone", "-q", "--branch", "cla-signatures", path.join(folder, "remote.git"), name);
    return path.join(folder, name);
  };

  beforeEach(() => {
    folder = mkdtempSync(path.join(tmpdir(), "cla-test-"));
    run(folder, "init", "-q", "--bare", "remote.git");
    const seed = path.join(folder, "seed");
    mkdirSync(path.join(seed, "signatures"), { recursive: true });
    writeFileSync(path.join(seed, "signatures", "cla.json"), `${JSON.stringify(none)}\n`);
    writeFileSync(path.join(seed, "exempt.json"), `${JSON.stringify(exempt)}\n`);
    run(seed, "init", "-q");
    run(seed, "add", ".");
    run(seed, "commit", "-q", "-m", "The signatures");
    run(seed, "push", "-q", path.join(folder, "remote.git"), "HEAD:refs/heads/cla-signatures");
  });
  afterEach(() => rmSync(folder, { recursive: true, force: true }));

  it("pushes the new signature to the branch", () => {
    const checkout = clone("runner");
    expect(recordSignature(checkout, signature("sam", 7)).signed.map((each) => each.login)).toEqual(["sam"]);
    expect(readSignatures(clone("after")).signed.map((each) => each.login)).toEqual(["sam"]);
  });

  it("starts again from the branch when another repository's push got there first, losing neither signature", () => {
    const slow = clone("slow");
    const fast = clone("fast");
    recordSignature(fast, signature("ada", 1));
    expect(recordSignature(slow, signature("sam", 7)).signed.map((each) => each.login)).toEqual(["ada", "sam"]);
    expect(readSignatures(clone("after")).signed.map((each) => each.login)).toEqual(["ada", "sam"]);
  });

  it("writes nothing when the account has signed already", () => {
    const checkout = clone("runner");
    const once = recordSignature(checkout, signature("sam", 7));
    expect(recordSignature(checkout, signature("sam", 7, 9))).toEqual(once);
    expect(run(checkout, "rev-list", "--count", "HEAD").toString().trim()).toBe("2");
  });
});
