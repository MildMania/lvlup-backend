# Git Setup Instructions

Since we've encountered issues with the Xcode license, please follow these steps to manually set up Git in your project:

1. First, accept the Xcode license by running:

```bash
sudo xcodebuild -license
```

You'll need to provide your administrator password and follow the prompts to accept the license.

2. Initialize the Git repository:

```bash
git init
```

3. Add all files to the staging area (excluding those in .gitignore):

```bash
git add .
```

4. Make the initial commit:

```bash
git commit -m "Initial commit"
```

5. If you have a remote repository, add it and push:

```bash
git remote add origin <your-repository-url>
git push -u origin main
```

The .gitignore file has already been created with appropriate exclusions for a Node.js/TypeScript project.
