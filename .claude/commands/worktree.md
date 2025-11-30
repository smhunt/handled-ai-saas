# Create Isolated Worktree for This Session

Create a new Git worktree so this Claude session can work independently without conflicting with other sessions.

## Steps:
1. Generate a unique worktree name using the current timestamp and a short random ID
2. Create the worktree as a sibling directory to this project
3. Run `pnpm install` in the new worktree
4. Run `npx prisma generate` if applicable
5. Output clear instructions telling the user to:
   - Open the new worktree directory in a new VS Code window
   - Start a new Claude session there
   - The new session will be isolated and safe to work independently

Use branch naming convention: `worktree/session-{timestamp}-{random}`

Example output:
```
Worktree created at: ../handled-ai-saas-session-abc123

To start an isolated Claude session:
  1. Open new VS Code window: code ../handled-ai-saas-session-abc123
  2. Start Claude in that terminal

When done, merge your branch and clean up:
  git checkout main
  git merge worktree/session-abc123
  git worktree remove ../handled-ai-saas-session-abc123
```
