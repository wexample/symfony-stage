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
