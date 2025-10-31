# Contributing to UDSL

We love your input! We want to make contributing to UDSL as easy and transparent as possible, whether it's:

- 🐛 Reporting a bug
- 💡 Discussing the current state of the code
- 🚀 Submitting a fix
- 📝 Proposing new features
- 🎯 Becoming a maintainer

## 🚀 Development Process

We use GitHub to host code, to track issues and feature requests, as well as accept pull requests.

### Pull Request Process

1. **Fork the Repository**
   ```bash
   git clone https://github.com/silasechegini/UDSL-Monorepo.git
   cd UDSL-Monorepo
   ```

2. **Create a Feature Branch**
   ```bash
   git checkout -b feature/my-awesome-feature
   # or
   git checkout -b fix/issue-number-description
   ```

3. **Set Up Development Environment**
   ```bash
   # Install dependencies
   pnpm install
   
   # Build all packages
   pnpm build
   
   # Run tests to ensure everything works
   pnpm test
   ```

4. **Make Your Changes**
   - Write your code
   - Add tests for new functionality
   - Update documentation if needed
   - Ensure your code follows our style guidelines

5. **Test Your Changes**
   ```bash
   # Run tests
   pnpm test
   
   # Run linting
   pnpm lint
   
   # Build to ensure no compilation errors
   pnpm build
   ```

6. **Commit Your Changes**
   ```bash
   git add .
   git commit -m "feat: add awesome new feature"
   ```

7. **Push and Create Pull Request**
   ```bash
   git push origin feature/my-awesome-feature
   ```
   Then create a pull request on GitHub.

## 📝 Commit Message Convention

We follow [Conventional Commits](https://www.conventionalcommits.org/) for clear and structured commit messages:

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

### Types
- `feat`: A new feature
- `fix`: A bug fix
- `docs`: Documentation only changes
- `style`: Changes that do not affect the meaning of the code
- `refactor`: A code change that neither fixes a bug nor adds a feature
- `perf`: A code change that improves performance
- `test`: Adding missing tests or correcting existing tests
- `chore`: Changes to the build process or auxiliary tools

### Examples
```bash
feat: add authentication plugin
fix: resolve cache invalidation race condition
docs: update README with new examples
test: add comprehensive SWR tests
refactor: simplify plugin registration logic
```

## 🏗️ Project Structure

Understanding the monorepo structure will help you contribute effectively:

```
UDSL-Monorepo/
├── packages/
│   ├── core/                 # Core UDSL functionality
│   ├── react-adapter/        # React integration
│   └── plugins/
│       └── auth/            # Authentication plugin
├── examples/
│   └── react-demo/         # Example applications
├── .github/                # GitHub workflows and templates
├── docs/                   # Additional documentation
└── tools/                  # Build and development tools
```

### Package Guidelines

#### Core Package (`@udsl/core`)
- Contains the main UDSL class and SWR implementation
- Should remain framework-agnostic
- All changes require comprehensive tests
- Performance is critical here

#### React Adapter (`@udsl/react-adapter`)
- React-specific hooks and components
- Should follow React best practices
- Hooks should handle loading, error, and success states
- Must be compatible with React 17+

#### Plugins (`@udsl/plugin-*`)
- Each plugin should be in its own package
- Should implement the `UDSLPlugin` interface
- Must include comprehensive README with examples
- Should handle errors gracefully

## ✅ Code Style and Standards

### TypeScript Guidelines
- Use strict TypeScript configuration
- Prefer explicit types over `any`
- Use proper generics for reusable components
- Document complex types with comments

```typescript
// ✅ Good
interface User {
  id: number;
  name: string;
  email: string;
}

function fetchUser<T extends User>(id: number): Promise<T> {
  // Implementation
}

// ❌ Avoid
function fetchUser(id: any): Promise<any> {
  // Implementation
}
```

### React Guidelines
- Use functional components with hooks
- Prefer custom hooks for reusable logic
- Handle loading and error states consistently
- Use proper dependency arrays in useEffect

```tsx
// ✅ Good
function UserList() {
  const { data: users, loading, error } = useData<User[]>('users');
  
  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorMessage error={error} />;
  
  return (
    <ul>
      {users?.map(user => (
        <UserItem key={user.id} user={user} />
      ))}
    </ul>
  );
}

// ❌ Avoid
function UserList() {
  const [users, setUsers] = useState();
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    // Manual fetch logic that duplicates UDSL functionality
  }, []);
  
  // Inconsistent loading/error handling
}
```

### Testing Guidelines
- Write tests for all new functionality
- Use descriptive test names
- Test both success and error scenarios
- Mock external dependencies

```typescript
// ✅ Good test structure
describe('useData hook', () => {
  it('should return loading state initially', () => {
    // Test implementation
  });
  
  it('should return data on successful fetch', async () => {
    // Test implementation
  });
  
  it('should handle network errors gracefully', async () => {
    // Test implementation
  });
});
```

## 🧪 Testing

### Running Tests
```bash
# Run all tests
pnpm test

# Run tests for specific package
cd packages/core && pnpm test

# Run tests with coverage
pnpm test --coverage

# Run tests in watch mode during development
pnpm test --watch
```

### Writing Tests
- Place tests in `__tests__` directories or alongside source files with `.test.ts` extension
- Use descriptive test names that explain the behavior
- Test both happy path and error cases
- Mock external dependencies appropriately

### Test Categories
1. **Unit Tests**: Test individual functions and components
2. **Integration Tests**: Test how different parts work together
3. **End-to-End Tests**: Test complete user workflows

## 📚 Documentation

### Code Documentation
- Use JSDoc comments for public APIs
- Include examples in documentation
- Document complex algorithms and business logic
- Keep README files up to date

### README Updates
When adding new features:
- Update relevant package README files
- Add examples showing how to use the feature
- Update the main repository README if needed
- Include any breaking changes in migration guides

## 🐛 Bug Reports

Great bug reports tend to have:

- A quick summary and/or background
- Steps to reproduce
  - Be specific!
  - Give sample code if you can
- What you expected would happen
- What actually happens
- Notes (possibly including why you think this might be happening, or stuff you tried that didn't work)

### Bug Report Template
```markdown
**Bug Description**
A clear and concise description of what the bug is.

**To Reproduce**
Steps to reproduce the behavior:
1. Go to '...'
2. Click on '....'
3. Scroll down to '....'
4. See error

**Expected Behavior**
A clear and concise description of what you expected to happen.

**Actual Behavior**
What actually happened.

**Code Sample**
```typescript
// Minimal reproducible example
const udsl = createUDSL({...});
// ... code that reproduces the issue
```

**Environment**
- OS: [e.g. Windows, macOS, Linux]
- Node.js version: [e.g. 18.17.0]
- Package version: [e.g. 0.1.0]
- Browser (if applicable): [e.g. Chrome 118]

**Additional Context**
Add any other context about the problem here.
```

## 💡 Feature Requests

We use GitHub issues to track feature requests. When proposing a new feature:

1. **Check existing issues** to avoid duplicates
2. **Explain the use case** - why is this feature needed?
3. **Describe the solution** - what should the feature do?
4. **Consider alternatives** - are there other ways to solve this?
5. **Provide examples** - show how the feature would be used

### Feature Request Template
```markdown
**Is your feature request related to a problem? Please describe.**
A clear and concise description of what the problem is.

**Describe the solution you'd like**
A clear and concise description of what you want to happen.

**Describe alternatives you've considered**
A clear and concise description of any alternative solutions you've considered.

**Code Example**
```typescript
// How you imagine the feature would work
const result = udsl.newFeature({...});
```

**Additional Context**
Add any other context or screenshots about the feature request here.
```

## 🎯 Getting Started Contributions

Good first contributions:
- 📝 Fix typos in documentation
- 🧪 Add missing tests
- 🐛 Fix small bugs
- 📚 Improve examples
- 🎨 Improve code formatting

Look for issues labeled:
- `good first issue`
- `help wanted`
- `documentation`
- `bug`

## 🏷️ Labels

We use labels to organize issues and pull requests:

- `bug` - Something isn't working
- `enhancement` - New feature or request
- `documentation` - Improvements or additions to documentation
- `good first issue` - Good for newcomers
- `help wanted` - Extra attention is needed
- `question` - Further information is requested
- `wontfix` - This will not be worked on

## 🔄 Release Process

Releases are handled by maintainers:

1. Version bumping follows [Semantic Versioning](https://semver.org/)
2. Changelog is automatically generated from commit messages
3. Packages are published to npm registry
4. GitHub releases are created with release notes

## 📞 Questions or Need Help?

- 💬 Open a [GitHub Discussion](https://github.com/silasechegini/UDSL-Monorepo/discussions)
- 🐛 Create an [Issue](https://github.com/silasechegini/UDSL-Monorepo/issues)
- 📧 Contact maintainers directly for sensitive issues

## 🙏 Recognition

Contributors will be recognized in:
- GitHub contributors list
- Release notes for significant contributions
- README acknowledgments
- Project documentation

Thank you for contributing to UDSL! 🚀

---

## License

By contributing, you agree that your contributions will be licensed under the same MIT License that covers the project.