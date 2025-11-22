# GitHub Actions Workflows

This directory contains all CI/CD workflows for the transit_driver project.

## Workflows

### `ci.yml`
Main CI pipeline that runs on every push and pull request:
- Linting with ESLint
- Testing with Jest
- Building the project
- Docker image building

### `deploy.yml`
Deployment pipeline for staging and production:
- Automatic deployment on branch push
- Manual deployment via workflow dispatch
- Database migrations
- Health checks

### `security-scan.yml`
Security scanning workflow:
- npm audit for dependency vulnerabilities
- Trivy for code security scanning
- Weekly scheduled scans

## Quick Start

1. **Set up GitHub Secrets** (see `CI_CD_DOCUMENTATION.md`)
2. **Push to `develop` branch** → Auto-deploys to staging
3. **Merge to `main` branch** → Auto-deploys to production

## Workflow Status Badges

Add these to your README.md:

```markdown
![CI Pipeline](https://github.com/YOUR_USERNAME/YOUR_REPO/workflows/CI%20Pipeline/badge.svg)
![Deploy Pipeline](https://github.com/YOUR_USERNAME/YOUR_REPO/workflows/Deploy%20Pipeline/badge.svg)
![Security Scan](https://github.com/YOUR_USERNAME/YOUR_REPO/workflows/Security%20Scan/badge.svg)
```

Replace `YOUR_USERNAME` and `YOUR_REPO` with your actual GitHub username and repository name.

