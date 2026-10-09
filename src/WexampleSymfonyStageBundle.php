<?php

namespace Wexample\SymfonyStage;

use Wexample\SymfonyHelpers\Class\AbstractBundle;
use Wexample\SymfonyHelpers\Helper\BundleHelper;
use Wexample\SymfonyHelpers\Interface\LoaderBundleInterface;

/**
 * The ground rich screens are built on — a diagram, a timeline, a graph: a
 * surface moved by the pointer, elements laid on it, picked, dragged and
 * linked, and the history of what was done. Front-end only: the bundle exists
 * so that the loader finds its assets.
 */
class WexampleSymfonyStageBundle extends AbstractBundle implements LoaderBundleInterface
{
    public static function getLoaderFrontPaths(): array
    {
        return [
            BundleHelper::getBundleCssAlias(static::class) => __DIR__.'/../assets/',
        ];
    }
}
