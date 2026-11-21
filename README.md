# hubnx/.github

HubNX, Inc.'s contributor license agreement (CLA), shared by every HubNX project that takes outside pull requests
(hubnx Agent, hubnx Music, hubnx Video), and the GitHub Actions workflow that checks it.

## The agreement

- [Individual CLA](cla/individual.md) and [Corporate CLA](cla/corporate.md): the Apache Software Foundation's
  Individual Contributor License Agreement (v2.2) and Software Grant and Corporate Contributor License Agreement
  (r190612). Every numbered clause is Apache's, word for word, with HubNX, Inc. for the Foundation. What differs:
  the one custom change below; Apache's instructions, its signer fields (name, address, e-mail) and its "read this
  document carefully" line, replaced by how to sign here, on GitHub; each title leaves out Apache's `("Agreement")`
  and version label (the version is named in the note at the top).
- **Why**: HubNX's open-source apps are under the AGPL-3.0. The agreement lets HubNX also ship contributions in the app
  stores and offer them under other licenses. You keep every right to use your own contributions.
- **One signature counts everywhere**: the agreement covers "any of the products owned or managed by HubNX, Inc.", and
  every repository's workflow reads and writes the one list of signers here.
- **One custom change to Apache's text**: its nonprofit sentence is dropped from both agreements (decided by HubNX,
  2026-11-21): "In return, the Foundation shall not use Your Contributions in a way that is contrary to the public
  benefit or inconsistent with its nonprofit status and bylaws in effect at the time of the Contribution." With a
  company named in it, it could be read as forbidding the paid licenses the agreement allows. Each signature records
  the commit of the documents its signer was shown.

## How signing works

- On a pull request, the account that opened it and every commit's author must have signed, be exempt, or have write
  access to that repository. (GitHub names a commit's author from its email, which anyone can set, so the opener
  counts too.) The pull request shows a **CLA** status, and the workflow comments once with the sentence to post.
- **To sign**, post exactly this comment on the pull request: *I have read the CLA and I agree to it.*
- The signature goes into [`signatures/cla.json`](https://github.com/hubnx/.github/blob/cla-signatures/signatures/cla.json) on this repository's
  `cla-signatures` branch, publicly: the GitHub login and account id, the time, the comment's link, the repository and
  pull request, and the commit of the agreements. A signature counts by account id, so it survives a renamed account.
- Signed, with other pull requests still waiting? Post the sentence on each: it records nothing new and brings that
  pull request's status up to date.
- A commit whose email isn't linked to a GitHub account can't be signed for: its author adds the email to their account
  (GitHub › Settings › Emails), or makes the commit again with one that is.
- **Exempt** by an explicit list, [`exempt.json`](https://github.com/hubnx/.github/blob/cla-signatures/exempt.json) on
  the same branch, read as it is now by every repository: bots by login, and the designated employees of a company
  whose Corporate CLA is on file (Schedule A), by login.

## Use it in a repository

1. Add `.github/workflows/cla.yml`, pinned to a commit of this repository (change the commit to take an update):

   ```yaml
   # The contributor license agreement, shared by every HubNX repository (github.com/hubnx/.github).
   name: CLA

   on:
     pull_request_target:
       types: [opened, synchronize, reopened]
     issue_comment:
       types: [created]

   permissions:
     contents: read
     pull-requests: write
     statuses: write

   jobs:
     cla:
       uses: hubnx/.github/.github/workflows/cla.yml@<commit SHA>
       with:
         contact: <the project's support address>
       secrets:
         CLA_SIGNATURES_KEY: ${{ secrets.CLA_SIGNATURES_KEY }}
   ```

2. Once, from a clone of this repository, by someone who administers both: `sh cla/add-repo.sh hubnx/<repository>`.
   It gives the repository a deploy key of its own here and sets it as the repository's `CLA_SIGNATURES_KEY` secret;
   the private key is kept nowhere else. Deleting that deploy key (this repository › Settings › Deploy keys) stops it.
   The organization must allow deploy keys (its Settings › Member privileges › Deploy keys). Until a repository has
   its key, its pull requests are still checked, and a signing comment fails its run, saying what's missing.
3. In its CONTRIBUTING.md: "Before your first pull request is merged, sign the CLA by commenting on it." and "Signing
   for a company? Email the Corporate CLA, filled in, to <the project's support address>."
4. Make the **CLA** status required for merging, in a ruleset on the default branch.

## Why it's safe to run on strangers' pull requests

- `pull_request_target` and `issue_comment` run the caller's own base branch with its secrets, so nothing of the pull
  request is ever checked out or run: the workflow runs this repository's code at the pinned commit
  (`job.workflow_sha`) and reads the pull request only through GitHub's API. Comment text reaches the script through
  the environment, never into a command line.
- The key that may push signatures is handed only to a signing comment's run. It is a deploy key on this repository
  alone, and the rulesets let it do one thing: add commits to `cla-signatures`. Every other branch and every tag is for
  admins only, and `cla-signatures` can't be force-pushed or deleted, so its history keeps every change.

## Tests

```sh
pnpm install
pnpm typecheck
pnpm test
```

The rules (what signs, who is exempt, who still has to sign) and the push to the one list, including two
repositories' pushes crossing, are tested in [`cla/cla.test.ts`](cla/cla.test.ts). GitHub Actions runs them on every
push and pull request.

## License

The code here (the script and the workflows) is under the [MIT license](LICENSE). The agreements are adapted from the
Apache Software Foundation's forms.
