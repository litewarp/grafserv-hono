function readPackage(pkg, _context) {
  if (pkg.dependencies.eslint) {
    pkg.dependencies.eslint = '^9.10.0';
  }
  if (pkg.devDependencies.eslint) {
    pkg.devDependencies.eslint = '^9.10.0';
  }
  if (pkg.peerDependencies.eslint) {
    pkg.peerDependencies.eslint = '^9.10.0';
  }

  return pkg;
}

module.exports = {
  hooks: {
    readPackage,
  },
};
