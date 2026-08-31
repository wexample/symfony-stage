# symfony_stage

Version: 1.0.94

`wexample/symfony-stage` is a Symfony bundle that provides the foundation for building interactive stage-style editors inside a Symfony application. It targets Symfony developers who already use the Wexample design system, registering the bundle's front-end assets against src/WexampleSymfonyStageBundle.php so the design system can resolve its CSS paths at build time.

## Table of Contents

- [Architecture](#architecture)
- [Integration in the Suite](#integration-in-the-suite)
- [Dependencies](#dependencies)
- [Versioning & Compatibility Policy](#versioning--compatibility-policy)
- [License](#license)
- [About us](#about-us)
- [Migration Notes](#migration-notes)

## Architecture

`wexample/symfony-stage` is a Symfony library package with a single PHP class. All server-side behaviour lives in src/WexampleSymfonyStageBundle.php; the package's front-end contribution is registered through that class so the design system can locate it at build time.

### Bundle class

`WexampleSymfonyStageBundle` extends `AbstractBundle` from `wexample/symfony-helpers` and lives under the `Wexample\SymfonyStage` namespace (PSR-4 root declared in composer.json: `"Wexample\\SymfonyStage\\" → "src/"`).

It overrides one method:

```php
public static function getDesignSystemFrontPaths(): array
{
    return [
        BundleHelper::getBundleCssAlias(static::class) => __DIR__.'/../assets/',
    ];
}
```

That method is the only contract the bundle fulfils. There are no services, controllers, commands, or event listeners.

### Call path through the design system

1. Symfony boots and discovers `WexampleSymfonyStageBundle`.
2. `wexample/symfony-design-system` (the sole `require` entry in composer.json) iterates over every bundle that implements `getDesignSystemFrontPaths()`.
3. It receives the map `[ cssAlias => absolutePath ]` and folds the returned path — `assets/` relative to the repository root — into its CSS compilation pipeline.
4. The `assets/` directory is the compiled output location; it is not committed to version control.

### Front-end source

The `front/` directory is the workspace for uncompiled front-end source files. Its contents are excluded from version control; only the compiled output in `assets/` is exposed to the design system.

## Integration in the Suite

This package is part of the Wexample Suite — a collection of high-quality, modular tools designed to work seamlessly together across multiple languages and environments.

### Related Packages

The suite includes packages for configuration management, file handling, prompts, and more. Each package can be used independently or as part of the integrated suite.

Visit the [Wexample Suite documentation](https://docs.wexample.com) for the complete package ecosystem.

## Dependencies

- wexample/symfony-design-system: >=8.0.0

## Versioning & Compatibility Policy

Wexample packages follow **Semantic Versioning** (SemVer):

- **MAJOR**: Breaking changes
- **MINOR**: New features, backward compatible
- **PATCH**: Bug fixes, backward compatible

We maintain backward compatibility within major versions and provide clear migration guides for breaking changes.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

Free to use in both personal and commercial projects.

## About us

[Wexample](https://wexample.com) stands as a cornerstone of the digital ecosystem — a collective of seasoned engineers, researchers, and creators driven by a relentless pursuit of technological excellence. More than a media platform, it has grown into a vibrant community where innovation meets craftsmanship, and where every line of code reflects a commitment to clarity, durability, and shared intelligence.

This packages suite embodies this spirit. Trusted by professionals and enthusiasts alike, it delivers a consistent, high-quality foundation for modern development — open, elegant, and battle-tested. Its reputation is built on years of collaboration, refinement, and rigorous attention to detail, making it a natural choice for those who demand both robustness and beauty in their tools.

Wexample cultivates a culture of mastery. Each package, each contribution carries the mark of a community that values precision, ethics, and innovation — a community proud to shape the future of digital craftsmanship.

## Migration Notes

When upgrading between major versions, refer to the migration guides in the documentation.

Breaking changes are clearly documented with upgrade paths and examples.
