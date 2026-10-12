# CLAUDE.md

## Workflow rules

- Run `git pull` on main before starting any new task.
- Never commit directly to main.
- Use one branch per task, named for the task.
- Run the build and tests before pushing: `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build`.
- Open a pull request for every change and let CI pass before merging.
- Never deploy manually. Railway auto-deploys from main, so merging to main is the deploy.
