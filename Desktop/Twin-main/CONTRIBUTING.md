# Contributing Guide

## Development Workflow

### 1. Create a Feature Branch

```bash
# Make sure you're on main and up to date
git checkout main
git pull origin main

# Create and switch to a new feature branch
git checkout -b feature/my-new-feature
```

### 2. Develop Your Feature

Make your changes, write code, add tests.

**Best Practices:**
- Write tests for new features
- Follow existing code style
- Keep commits focused and meaningful

### 3. Test Locally Before Pushing

```bash
# Run tests to make sure nothing broke
pnpm test

# Check for type errors
pnpm typecheck

# Check for linting issues
pnpm lint

# If tests pass, you're good to push!
```

### 4. Commit Your Changes

```bash
# Stage your changes
git add .

# Commit (pre-commit hooks will run automatically)
git commit -m "feat: add new feature description"
```

**Note:** Pre-commit hooks will automatically:
- Run ESLint on changed files
- Format code with Prettier
- Prevent committing if there are errors

### 5. Push to Your Branch

```bash
git push origin feature/my-new-feature
```

**GitHub Actions CI will automatically:**
- ✅ Run linting
- ✅ Run type checking
- ✅ Run all tests
- ✅ Verify the build works

If any step fails, you'll see a ❌ on your PR. Fix the issues and push again.

### 6. Create a Pull Request

1. Go to https://github.com/ARTEN-max/Twin
2. Click "New Pull Request"
3. Select your branch
4. Add a description of your changes
5. Wait for CI to pass (green checkmark ✅)

### 7. Merge to Main

Once CI passes and the PR is approved:
- Click "Merge pull request"
- Your changes will be merged to `main`
- CI will run again on `main` to ensure everything still works

## Branch Naming Conventions

Use descriptive branch names:
- `feature/voice-enhancements`
- `fix/recording-upload-bug`
- `refactor/api-routes`
- `docs/update-readme`

## Commit Message Format

Follow conventional commits:
- `feat: add new feature`
- `fix: resolve bug in recordings`
- `docs: update documentation`
- `test: add tests for new feature`
- `refactor: improve code structure`

## Testing Requirements

- All new features should have tests
- Existing tests must pass
- Coverage should not drop below thresholds:
  - API: 70%
  - Web: 60%

## Getting Help

- Check [TESTING.md](./TESTING.md) for testing guidelines
- Check [README.md](./README.md) for setup instructions
- Check [QUICKSTART.md](./QUICKSTART.md) for quick start guide

Happy coding! 🚀
