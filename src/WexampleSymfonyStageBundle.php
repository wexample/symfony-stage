<?php

namespace Wexample\SymfonyStage;

use Wexample\SymfonyHelpers\Class\AbstractBundle;
use Wexample\SymfonyHelpers\Helper\BundleHelper;

class WexampleSymfonyStageBundle extends AbstractBundle
{
    public static function getDesignSystemFrontPaths(): array
    {
        return [
            BundleHelper::getBundleCssAlias(static::class) => __DIR__.'/../assets/',
        ];
    }
}
