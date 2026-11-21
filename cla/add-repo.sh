#!/bin/sh
# Lets a repository's CLA workflow record signatures (README.md › Use it in a repository): a deploy key of its own on
# hubnx/.github, which may push (the rulesets keep it to the cla-signatures branch), with its private half set as that
# repository's CLA_SIGNATURES_KEY secret and never kept anywhere else. Run once per repository, by someone who
# administers both, with the GitHub CLI signed in. Deleting that deploy key stops the repository signing.
#
#   sh cla/add-repo.sh hubnx/<repository> [the repository holding the signatures, default hubnx/.github]
set -eu
repository="${1:?which repository, as owner/name}"
signatures="${2:-hubnx/.github}"
folder=$(mktemp -d)
trap 'rm -rf "$folder"' EXIT
ssh-keygen -q -t ed25519 -N '' -C "CLA signatures from $repository" -f "$folder/key"
gh api "repos/$signatures/keys" -f title="CLA signatures from $repository" -f key="$(cat "$folder/key.pub")" -F read_only=false --jq '"cla: deploy key \(.id) added to '"$signatures"'"'
gh secret set CLA_SIGNATURES_KEY --repo "$repository" < "$folder/key"
echo "cla: $repository can record signatures in $signatures"
