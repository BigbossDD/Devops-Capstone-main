# DevOps Capstone Project

## 1. What is this project?

You're given a working **microservices e-commerce app** — three independent
backend services (auth, catalog, orders) plus a React frontend. Your job is
**everything around the app**: take it from "runs on my laptop" to a fully
automated deployment on real AWS infrastructure, provisioned entirely by
Terraform, running on a Kubernetes cluster you build yourself on EC2, with a
GitHub Actions pipeline that ships every code change automatically.

Nobody hands you a managed Kubernetes service here. There's no EKS button to
click. You provision plain EC2 instances and turn them into a Kubernetes
cluster yourselves with `k3s` (a lightweight, fully-conformant Kubernetes
distribution). That's intentional — it's harder than clicking "create
cluster," and it's exactly the kind of work that teaches you what Kubernetes,
load balancers, and networking actually do underneath the abstraction.

**The app code is done. Your assignment is infrastructure, automation, and
operations.**

See [`docs/aws-architecture.png`](./docs/aws-architecture.png) for the full
diagram referenced throughout this document.

## 2. Architecture at a glance

```
GitHub push → GitHub Actions (CI) → builds 4 Docker images → pushes to ECR
                                                                    │
GitHub Actions (CD, self-hosted runner on the k3s control-plane) ──┘
        │ kubectl apply
        ▼
┌────────────────────────────── AWS VPC (10.0.0.0/16) ───────────────────────────────┐
│                                                                                     │
│   Internet ── Internet Gateway ── Application Load Balancer (2 AZs, public subnets)│
│                                          │ NodePort                                │
│                       ┌──────────────────┼──────────────────┐                     │
│                  k3s control-plane   k3s worker (ASG)   k3s worker (ASG)           │
│                  (private subnet)    (private subnet)   (private subnet, 2-4x)     │
│                       │                                                            │
│                       └──────────────► Amazon RDS (PostgreSQL, private subnet)     │
│                                                                                     │
│   Private subnets reach the internet (to pull images from ECR) via a NAT Instance  │
│   sitting in the public subnet — not a paid NAT Gateway.                           │
└─────────────────────────────────────────────────────────────────────────────────────┘

Amazon S3 — holds Terraform remote state and database backups (outside the VPC)
Amazon ECR — 4 image repositories: auth-service, catalog-service, orders-service, frontend
```

Why this shape, specifically:

- **No EKS.** EKS charges ~$0.10/hour (~$73/month) just for the control plane
  to exist, before you run a single pod. Running Kubernetes yourself on
  free-tier EC2 instances costs nothing extra and teaches you what EKS hides.
- **NAT Instance, not NAT Gateway.** A managed NAT Gateway costs ~$0.045/hour
  plus data processing fees, billed continuously. A `t3.micro` EC2 instance
  configured as a NAT does the same job and fits in the free tier.
- **RDS instead of SQLite.** The app currently stores data in local SQLite
  files. That works fine on one laptop, but breaks the moment you have
  multiple Kubernetes pods/EC2 workers — each one would have its own
  disconnected copy of the data. Migrating each service to PostgreSQL on RDS
  is part of your assignment (see §5.6) — it's the most realistic "this
  actually breaks in production" lesson in the whole project.
- **Self-hosted GitHub Actions runner on the control-plane instance**, instead
  of exposing the Kubernetes API to the internet or wiring up a VPN. The
  runner lives inside your VPC, already has `kubectl` configured, and GitHub
  Actions jobs execute on it directly — no public API endpoint needed.

## 3. What's provided vs. what you build

| Provided & working | You build, currently empty |
|---|---|
| `services/auth-service/` (Flask + SQLite + JWT) | `services/*/Dockerfile`, `frontend/Dockerfile` |
| `services/catalog-service/` (Flask + SQLite) | `terraform/` — root files + 8 modules |
| `services/orders-service/` (Flask + SQLite, calls catalog-service) | `k8s/**/*.yaml` |
| `frontend/` (React/Vite SPA) | `.github/workflows/*.yml` |
| | `scripts/*.sh` |
| | RDS migration for each service (code change) |

## 4. Where to start — order of operations

Don't jump straight to Terraform. Do these in order; each phase depends on
the previous one actually working.

1. **Run the app locally exactly as provided** (no Docker, no AWS) — confirms
   your baseline before you change anything. See §5.1.
2. **Containerize everything** — write the 4 Dockerfiles, get them running
   together with a Compose file you write yourself. See §5.2.
3. **Migrate each service from SQLite to PostgreSQL**, tested locally against
   a Postgres container first — before RDS even exists. See §5.6.
4. **Write the Terraform modules**, bottom-up: networking first
   (vpc → security-groups → nat-instance), then compute/data
   (ec2-cluster, rds, alb, ecr), then iam-oidc last. See §5.3.
5. **Bring the k3s cluster up manually** via SSM Session Manager and confirm
   `kubectl get nodes` works before writing a single YAML manifest. See §5.5.
6. **Write the Kubernetes manifests** and deploy by hand with `kubectl apply`.
   Get the app fully working in the cluster before automating anything.
7. **Wire up GitHub Actions** last — CI first (build/push images), then CD
   (deploy). Automating a pipeline for something that doesn't work manually
   yet just hides where the real problem is.
8. **Write the Bash scripts** (`setup.sh`, `deploy.sh`, `healthcheck.sh`,
   `teardown.sh`) — by this point you already know the exact commands; you're
   just making them repeatable.

## 5. Step-by-step per tool

### 5.1 Linux & Bash — first, before anything else

Run the app locally with nothing but Python and Node, to know what "working"
looks like:

```bash
cd services/auth-service && python -m venv venv && source venv/bin/activate && pip install -r requirements.txt && python app.py
cd services/catalog-service && python -m venv venv && source venv/bin/activate && pip install -r requirements.txt && python app.py
cd services/orders-service && python -m venv venv && source venv/bin/activate && pip install -r requirements.txt && python app.py
cd frontend && npm install && npm run dev
```

Once everything else is built, write the 4 scripts in `scripts/` (currently
empty):

- **`setup.sh`** — checks that `aws`, `kubectl`, `terraform`, `docker`, `git`
  are installed before anyone wastes an hour debugging a missing CLI.
- **`deploy.sh`** — a local wrapper around `terraform apply` +
  `kubectl apply`, so you can test infra/deploy changes without waiting on
  GitHub Actions.
- **`healthcheck.sh`** — curls `/health` on all 3 backend services and checks
  pod status; this is your first debugging tool when something's broken.
- **`teardown.sh`** — `terraform destroy` behind a confirmation prompt. Run
  this at the end of every work session — see §6 on cost.

Use `set -euo pipefail` in every script so failures stop execution instead of
silently continuing.

### 5.2 Docker

Write one Dockerfile per component (`services/auth-service/Dockerfile`,
`services/catalog-service/Dockerfile`, `services/orders-service/Dockerfile`,
`frontend/Dockerfile` — all currently empty 0-byte files).

- The 3 backend services are plain Python/Flask — a simple `python:3.12-slim`
  base, `pip install -r requirements.txt`, `CMD ["python", "app.py"]` is
  enough to start; consider `gunicorn` for anything closer to production.
- The frontend needs **two stages**: a `node` stage that runs
  `npm run build` to produce static files, and an `nginx` (or similar) stage
  that just serves the built output. This keeps the final image small — it
  doesn't need Node.js inside it at all.
- Write a `docker-compose.yml` (anywhere you like, e.g. repo root) that brings
  up all 4 containers plus a `postgres` container, so you can test the full
  stack — including the RDS migration from §5.6 — before any of it touches
  AWS.

### 5.3 Terraform — organized into modules

`terraform/` root files (`main.tf`, `variables.tf`, `outputs.tf`,
`providers.tf`, `versions.tf`, `backend.tf`, `terraform.tfvars.example`) wire
together 8 modules under `terraform/modules/`. Build them in this order —
each one depends on outputs from the one before it:

| Order | Module | What it provisions |
|---|---|---|
| 0 | *(manual, one-time)* | S3 bucket + DynamoDB table for remote state — bootstrap this by hand or with a tiny separate config before `backend.tf` can use it |
| 1 | `modules/vpc` | VPC, 2 public + 2 private subnets across 2 AZs, Internet Gateway, public + private route tables |
| 2 | `modules/security-groups` | `alb-sg`, `k3s-sg`, `rds-sg`, `nat-sg` (see §5.4 for exact rules) |
| 3 | `modules/nat-instance` | EC2 NAT instance in a public subnet; private route table points its `0.0.0.0/0` route at this instance's network interface |
| 4 | `modules/ecr` | 4 ECR repositories — one per component |
| 5 | `modules/ec2-cluster` | The k3s control-plane EC2 instance + a Launch Template/Auto Scaling Group for worker nodes. Uses the two `.sh.tpl` files in `modules/ec2-cluster/templates/` as `user_data` (via Terraform's `templatefile()`) to bootstrap k3s automatically on boot |
| 6 | `modules/rds` | PostgreSQL instance (`db.t3.micro`), DB subnet group spanning both private subnets, parameter group |
| 7 | `modules/alb` | Application Load Balancer + target group (type `instance`) attached to the ASG, listener on port 80 forwarding to the NodePort your Ingress controller listens on |
| 8 | `modules/iam-oidc` | GitHub OIDC provider + IAM role trusted only by your specific repo, scoped to exactly what CI/CD needs (ECR push, EC2 describe, SSM) |

Root `main.tf` calls each module and passes outputs from earlier ones as
inputs to later ones — e.g. `modules/ec2-cluster` needs the private subnet
IDs from `modules/vpc` and the security group ID from
`modules/security-groups`.

### 5.4 AWS networking — what each piece is actually for

This is the part students usually click through without understanding on a
console tutorial. Here, you're writing it as code, so know what each line
does:

- **VPC** — your own private network inside AWS, isolated from every other
  AWS customer. Everything else lives inside it.
- **Subnets** — subdivisions of the VPC tied to one Availability Zone each. A
  subnet is "public" or "private" purely by which route table it's
  associated with — there's no special "public subnet" resource type.
- **Internet Gateway (IGW)** — attaches to the VPC and is the only thing that
  lets traffic in/out to the public internet at all. A subnet is "public"
  because its route table sends `0.0.0.0/0` traffic to the IGW.
- **Route Tables** — literally just a list of "if traffic is going to X, send
  it to Y." Your public route table says "internet-bound traffic → IGW."
  Your private route table says "internet-bound traffic → NAT instance."
- **NAT (Instance)** — lets resources in private subnets (your k3s nodes)
  reach the internet (to pull images from ECR, install packages) **without**
  being reachable *from* the internet. A managed NAT Gateway does this too,
  but bills hourly; a plain EC2 instance with IP forwarding enabled does the
  identical job for free-tier cost.
- **Security Groups** — stateful virtual firewalls attached to resources
  (not subnets). You need four: `alb-sg` (allow 80/443 from anywhere),
  `k3s-sg` (allow NodePort range only from `alb-sg`, nothing from the public
  internet), `rds-sg` (allow 5432 only from `k3s-sg`), `nat-sg` (allow
  traffic from inside the VPC CIDR only). Each one only opens exactly what
  the next layer needs — never wider.

### 5.5 AWS compute/data — EC2, ASG, ALB, RDS, S3

- **EC2** — the actual virtual machines. One runs the k3s control-plane (the
  Kubernetes "brain" — API server, scheduler, etcd); the rest are workers
  that actually run your application's containers.
- **Auto Scaling Group (ASG)** — manages the worker EC2 instances as a group:
  keeps a minimum count running, replaces any that fail health checks, and
  can scale out under load. The ALB's target group attaches to the ASG
  directly, so new workers register themselves automatically — you never
  manually add an instance to the load balancer.
- **Application Load Balancer (ALB)** — the single public entry point.
  Forwards incoming HTTP traffic to a NodePort that's open on every k3s node
  (control-plane and workers alike), where your Ingress controller picks it
  up and routes it to the right service inside the cluster.
- **Amazon RDS** — managed PostgreSQL. You don't manage patching, backups, or
  the underlying OS — you just get a connection string. This is where each
  service's data lives once you complete the SQLite → Postgres migration
  (§5.6), since it's reachable from every worker node identically, unlike a
  local SQLite file that only exists on one machine.
- **Amazon S3** — object storage, used here for two things outside the VPC
  entirely: Terraform's remote state file (so state isn't just sitting on
  one person's laptop) and a destination for periodic database backups.

Bring the cluster up and confirm it manually before writing any Kubernetes
YAML:

```bash
# Connect to the control-plane instance with no SSH key, no bastion, no public IP:
aws ssm start-session --target <control-plane-instance-id>

# On the instance, once k3s is installed (your user-data script does this):
sudo k3s kubectl get nodes
```

### 5.6 Migrating SQLite → RDS PostgreSQL (required)

Each service currently opens a local `sqlite3` file. That's fine for one
process on one laptop. It silently breaks the moment you run 2+ replicas
across different EC2 workers — each pod gets its own empty/divergent SQLite
file, and "my order disappeared" bugs start happening that look random but
aren't.

For each of the 3 services:

1. Add `psycopg2-binary` to `requirements.txt`.
2. Replace the `sqlite3.connect(...)` calls with a Postgres connection,
   driven by a `DATABASE_URL` (or `DB_HOST`/`DB_NAME`/`DB_USER`/`DB_PASSWORD`)
   environment variable — don't hardcode RDS's endpoint into code.
3. Adjust SQL syntax differences where they exist (e.g. `SERIAL` vs
   SQLite's `AUTOINCREMENT` — Postgres uses `SERIAL`/`GENERATED ... AS
   IDENTITY`).
4. Test against a local `postgres` Docker container before pointing
   anything at RDS.
5. In Kubernetes, inject the RDS endpoint and credentials via a
   ConfigMap + Secret (see `k8s/*/secret.yaml`) — never commit real
   credentials to git.

### 5.7 Kubernetes (k3s)

`k8s/` is organized per-component, mirroring the 4 things you deploy:

```
k8s/
  namespace.yaml
  ingress.yaml         routes by path to each service via Traefik (bundled with k3s)
  hpa.yaml              autoscale at least one Deployment by CPU
  auth-service/      deployment.yaml, service.yaml, secret.yaml
  catalog-service/   deployment.yaml, service.yaml
  orders-service/    deployment.yaml, service.yaml, secret.yaml
  frontend/          deployment.yaml, service.yaml
```

Build order:

1. `namespace.yaml` first — everything else lives in it.
2. `catalog-service/` — no dependencies on the other two services, easiest
   to get right first.
3. `auth-service/` — needs its `secret.yaml` to define `SHARED_SECRET`.
4. `orders-service/` — needs the **same** `SHARED_SECRET` value as
   auth-service (it verifies JWTs locally without calling back to
   auth-service — if the secrets don't match, every order request will
   return 401, which is the point: this teaches you to trace an auth failure
   across services).
5. `frontend/`.
6. `ingress.yaml` once all 4 Services exist, so it has something to route to.
   Service type should be `ClusterIP`, with the Ingress (Traefik) exposed via
   a `NodePort` Service — that NodePort is what the ALB's target group points
   at.
7. `hpa.yaml` last, once the app is stable enough to load-test.

Every Deployment needs readiness/liveness probes against `/health` and
resource requests/limits — workers are small (`t3.micro`), so an unbounded
pod can starve its neighbors.

### 5.8 CI/CD — GitHub Actions

Three workflows in `.github/workflows/` (currently empty):

1. **`ci.yml`** — on PR and push to `main`: run any tests, build all 4 Docker
   images, and (on `main` only) push them to their ECR repos. Authenticate to
   AWS via the OIDC role from `modules/iam-oidc` — **no static AWS access
   keys stored as GitHub secrets, ever.**
2. **`terraform.yml`** — `terraform plan` commented on every PR that touches
   `terraform/`; `terraform apply` on merge to `main`, also via OIDC.
3. **`deploy.yml`** — runs on the **self-hosted runner** registered on the
   k3s control-plane instance (register it once, manually or via a setup
   script, following GitHub's repo settings → Actions → Runners flow). Its
   job just runs `kubectl apply -f k8s/` and `kubectl rollout status` for
   each Deployment, using the new image tags `ci.yml` just pushed. Because
   the runner lives inside your VPC already authenticated to the cluster,
   you never need to expose the Kubernetes API publicly or manage a
   kubeconfig secret in GitHub.

## 6. How everything connects (the full request/deploy lifecycle)

**A user request:** browser → ALB (public subnet, port 80) → target group →
NodePort on whichever k3s node Traefik landed on → Traefik routes by path to
the right ClusterIP Service → pod → (for orders) outbound call to
catalog-service's ClusterIP → (for any service) RDS over port 5432.

**A code change:** `git push` to `main` → `ci.yml` runs on GitHub-hosted
runners, builds + pushes images to ECR via OIDC → `deploy.yml` runs on the
self-hosted runner sitting on your control-plane EC2 instance → that runner
already has `kubectl` pointed at the local k3s cluster → it applies the
manifests with the new image tags → Kubernetes does a rolling update → ALB
health checks confirm the new pods are healthy before sending them traffic.

**Terraform's role in all of this:** it's the only thing that talks directly
to the AWS API. Everything above — the VPC, the EC2 instances, the ALB, RDS,
the OIDC trust relationship that lets GitHub Actions authenticate at all —
exists because Terraform created it. Nothing in `k8s/` or
`.github/workflows/` can do anything until `terraform apply` has run
successfully first.

## 7. Cost discipline

See the cost callout box in [`docs/aws-architecture.png`](./docs/aws-architecture.png).
Short version: this architecture is free-tier-eligible for the first 12
months of an AWS account if you **don't leave it running 24/7**. Run
`scripts/teardown.sh` at the end of every work session — RDS storage and S3
are the only things that keep costing anything (cents) while torn down, and
even those go away if you delete the RDS instance and empty the S3 bucket at
the very end of the project.

## 8. More detail

- [`PROJECT_BRIEF.md`](./PROJECT_BRIEF.md) — milestones, deliverables,
  submission checklist.
- [`RUBRIC.md`](./RUBRIC.md) — exact point breakdown.
- Each service and the frontend has its own `README.md` with exact run
  instructions and environment variables.
