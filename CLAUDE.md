# Claude Code Instructions for This Project

## Multi-Session Work (IMPORTANT)

If you're running multiple Claude sessions on this project simultaneously, each session should work in its own Git worktree to avoid conflicts.

**Before starting significant work, ask the user:**
> "Are other Claude sessions working on this project? If so, I should create an isolated worktree first. Run `/worktree` to set one up."

### Quick Worktree Setup
```bash
# Create isolated worktree
git worktree add ../handled-ai-saas-$(openssl rand -hex 3) -b worktree/session-$(date +%s)
cd ../handled-ai-saas-*  # go to new directory
pnpm install
npx prisma generate
```

### Cleanup After Work
```bash
git checkout main
git merge <your-branch>
git worktree remove <worktree-path>
```

## Project Structure

- `backend/` - Express API server (TypeScript)
- `dashboard/` - React admin dashboard (Vite + TypeScript)
- `widget/` - Embeddable chat widget

## Common Commands

```bash
pnpm install          # Install all dependencies
pnpm dev              # Start dev servers
pnpm build            # Build for production
pnpm test             # Run tests
npx prisma generate   # Generate Prisma client
npx prisma migrate dev # Run migrations
```
