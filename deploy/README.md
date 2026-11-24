# Azure backend deployments

[Deploy backend](../.github/workflows/deploy-backend.yml) runs when a push to `main` changes a file under `backend/`. GitHub Actions connects to the Azure VM and requests a deployment. The VM fetches `main` under a deployment lock, builds the backend services, and lets Compose apply Alembic migrations before starting the updated API and workers. The job succeeds after the public `/ready` check passes.

## Credentials and server layout

- `OTAGAI_DEPLOY_SSH_KEY` is the Actions-to-VM private key. The VM authorizes its public key with a forced command and SSH forwarding disabled.
- `OTAGAI_DEPLOY_KNOWN_HOSTS` pins the Azure VM host key.
- The VM holds a separate read-only repository deploy key under `~/.local/share/otagai-deploy/`. The Git mirror uses it to fetch the private repository.
- `~/otagai/.env.production` stays on the VM and is used by the existing Compose project.

Install [the server script](auto-deploy-backend.sh) as `~/.local/bin/otagai-deploy-backend` with mode `700` on the VM. The SSH key allows `verify` for checking the connection and `deploy <commit SHA>` for releases. Deploy requests must refer to a commit on `main`. A queued job always uses the latest backend on `main`.

## Check a release

Open the GitHub Actions run for **Deploy backend**. The log shows which revision was built and whether [production readiness](https://otagai.hemal.me/ready) passed. If a build fails, the existing backend source remains in use. Fix the build or migration failure and rerun the job.

The initial backend source is retained in `~/.local/share/otagai-deploy/initial-backend`. Subsequent source snapshots are kept under `~/.local/share/otagai-deploy/releases/`. The job records a revision as deployed after readiness succeeds.
