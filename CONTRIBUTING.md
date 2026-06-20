# Contributing

Thank you for your interest in contributing!

## 🌱 This Repo Is a Derived Scraper

This is a **derived scraper** for EMERSON SRL, based on the [epam-systems-international-srl-nodejs-scraper](https://github.com/sebiboga/epam-systems-international-srl-nodejs-scraper) template.

If you are looking to create a new scraper for another Romanian company, start from the **EPAM template** (not this repo). The template includes a comprehensive derivation guide ([AI-DERIVATION-GUIDE.md](AI-DERIVATION-GUIDE.md) in the template) and is kept up to date with all known pitfalls.

## Code Style

- Use ES6+ modules (`type: module` in `package.json`)
- Add tests for new features in the matching `tests/<level>/` folder
- Ensure all tests pass before submitting PR
- Reference a GitHub issue in every commit (see [ISSUES.md](ISSUES.md))

## Development Setup

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/emerson-srl-nodejs-scraper.git

# Install dependencies
npm install

# Run tests
npm test
```

## Reporting Issues

Open a [GitHub Issue](https://github.com/sebiboga/emerson-srl-nodejs-scraper/issues) with:
- Clear description of the problem
- Steps to reproduce
- Expected vs actual behavior
- Environment details (Node version, OS)

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
