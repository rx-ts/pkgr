import { AngularCompilerPlugin } from '@ngtools/webpack'
import { alias } from '@pkgr/es-modules'
import {
  DEV,
  EXTENSIONS,
  NODE_MODULES_REG,
  PROD,
  __DEV__,
  __PROD__,
  findUp,
  identify,
  isAngularAvailable,
  isMdxAvailable,
  isReactAvailable,
  isTsAvailable,
  isVueAvailable,
  tryExtensions,
  tryFile,
  tryPkg,
} from '@pkgr/utils'
import CaseSensitivePathsWebpackPlugin from 'case-sensitive-paths-webpack-plugin'
import CopyWebpackPlugin from 'copy-webpack-plugin'
import debug from 'debug'
import FriendlyErrorsWebpackPlugin from 'friendly-errors-webpack-plugin'
import HtmlWebpackHarddiskPlugin from 'html-webpack-harddisk-plugin'
import HtmlWebpackInlineSourcePlugin from 'html-webpack-inline-source-plugin'
import HtmlWebpackPlugin from 'html-webpack-plugin'
import LazyCompileWebpackPlugin from 'lazy-compile-webpack-plugin'
import MiniCssExtractPlugin from 'mini-css-extract-plugin'
import { resolve } from 'path'
import TsconfigPathsWebpackPlugin from 'tsconfig-paths-webpack-plugin'
import { VueLoaderPlugin } from 'vue-loader'
import webpack, { Configuration } from 'webpack'
import { GenerateSW } from 'workbox-webpack-plugin'

const info = debug('w:info')

export interface ConfigOptions {
  entry?: string
  type?: 'angular' | 'react' | 'vue'
  outputDir?: string
  copies?: Array<
    | string
    | {
        from: string
        to?: string
      }
  >
  prod?: boolean
}

const tsconfigFile = tryFile([
  'tsconfig.app.json',
  'tsconfig.base.json',
  'tsconfig.json',
  tryPkg('@1stg/tsconfig')!,
])

const extraLoaderOptions: Record<string, {}> = {
  less: {
    javascriptEnabled: true,
  },
}

export default ({
  entry = 'src',
  outputDir = 'dist',
  type,
  copies = [],
  prod = __PROD__,
}: ConfigOptions = {}) => {
  entry = tryFile(
    ['index', 'main', 'app'].map(_ =>
      tryExtensions(resolve([entry, _].join('/'))),
    ),
  )

  const angular = type === 'angular' || (!type && isAngularAvailable)
  const react = type === 'react' || (!type && isReactAvailable)
  const vue = type === 'vue' || (!type && isVueAvailable)

  const pkgFile = findUp(entry)

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pkg: Record<string, string> = pkgFile ? require(pkgFile) : {}

  const hashType = prod ? 'contenthash' : 'hash'

  const sourceMap = !prod

  const baseBabelLoader = {
    loader: 'babel-loader',
    options: {
      cacheDirectory: true,
      presets: [
        [
          '@1stg',
          {
            typescript: true,
            metadata: angular,
            react,
            vue,
          },
        ],
      ],
    },
  }

  const babelLoader = ['cache-loader', 'thread-loader', baseBabelLoader]

  const baseCssLoaders = (modules = false, extraLoader?: string) =>
    [
      prod
        ? MiniCssExtractPlugin.loader
        : vue
        ? 'vue-style-loader'
        : 'style-loader',
      'cache-loader',
      {
        loader: 'css-loader',
        options: {
          importLoaders: extraLoader ? 1 : 2,
          localsConvention: 'camelCaseOnly',
          modules: modules && {
            localIdentName: prod
              ? '[hash:base64:10]'
              : '[path][name]__[local]---[hash:base64:5]',
          },
          sourceMap,
        },
      },
      {
        loader: 'postcss-loader',
        options: {
          sourceMap,
        },
      },
      extraLoader && {
        loader: extraLoader,
        options: {
          ...extraLoaderOptions[extraLoader],
          sourceMap,
        },
      },
    ].filter(identify)

  const cssLoaders = (extraLoader?: string) => [
    {
      test: /(globals?|node_modules)/,
      use: baseCssLoaders(false, extraLoader),
    },
    {
      use: baseCssLoaders(true, extraLoader),
    },
  ]

  const svgLoader = react ? '@svgr/webpack' : vue && 'vue-svg-loader'

  const template =
    tryExtensions(resolve(entry, '../index'), ['.pug', '.html', '.ejs']) ||
    resolve(__dirname, '../index.pug')

  const config: Configuration = {
    mode: prod ? PROD : DEV,
    devtool: !prod && 'cheap-module-eval-source-map',
    devServer: {
      clientLogLevel: 'warning',
      host: '0.0.0.0',
      hot: true,
      disableHostCheck: true,
      historyApiFallback: true,
    },
    entry: {
      app: [!prod && react && 'react-hot-loader/patch', entry].filter(identify),
    },
    node: {
      fs: 'empty',
    },
    resolve: {
      alias: Object.assign(
        {},
        alias,
        prod ||
          (react && {
            'react-dom': '@hot-loader/react-dom',
          }),
      ),
      extensions: ['.ts', '.tsx', vue && '.vue', isMdxAvailable && '.mdx']
        .concat(EXTENSIONS)
        .filter(identify),
      plugins: [
        isTsAvailable &&
          new TsconfigPathsWebpackPlugin({
            configFile: tsconfigFile,
          }),
      ].filter(identify),
    },
    output: {
      filename: `[name].[${hashType}].js`,
      path: resolve(outputDir),
    },
    module: {
      rules: [
        {
          parser: {
            system: false,
          },
        },
        {
          test: /\.m?[jt]sx?$/,
          oneOf: [
            angular && {
              test: /(?:\.ngfactory\.js|\.ngstyle\.js|\.ts)$/,
              use: ['cache-loader', baseBabelLoader, '@ngtools/webpack'],
            },
            {
              use: babelLoader,
            },
          ].filter(identify),
          exclude: (file: string) =>
            NODE_MODULES_REG.test(file) &&
            !/\.(mjs|jsx|tsx?|vue\.js)$/.test(file),
        },
        {
          test: /\.mdx?$/,
          use: babelLoader.concat('@mdx-js/loader'),
        },
        vue && {
          test: /\.vue$/,
          loader: 'vue-loader',
        },
        {
          test: /\.css$/,
          oneOf: cssLoaders(),
        },
        {
          test: /\.less$/,
          oneOf: cssLoaders('less'),
        },
        {
          test: /\.s[a|c]ss$/,
          oneOf: cssLoaders('sass'),
        },
        {
          test: /\.styl(us)?$/,
          oneOf: cssLoaders('stylus'),
        },
        {
          test: /\.svg(\?v=\d+\.\d+\.\d+)?$/,
          oneOf: [
            svgLoader && {
              issuer: /\.[jt]sx?$/,
              loader: svgLoader,
            },
            {
              loader: 'url-loader',
            },
          ].filter(identify),
        },
        {
          test: /\.(eot|gif|jpe?g|png|ttf|woff2?)(\?v=\d+\.\d+\.\d+)?$/,
          loader: 'url-loader',
        },
        {
          test: /\.html$/,
          loader: 'html-loader',
          options: {
            minimize: prod,
          },
        },
        {
          test: /\.pug$/,
          oneOf: [
            {
              include: template,
              loader: 'pug-loader',
            },
            {
              loader: 'pug-plain-loader',
            },
          ],
        },
      ].filter(identify),
    },
    plugins: [
      new webpack.DefinePlugin({
        __DEV__: !prod && __DEV__,
        __PROD__: prod,
      }),
      angular &&
        new AngularCompilerPlugin({
          compilerOptions: {
            emitDecoratorMetadata: true,
            target: 8, // represents esnext
          },
          mainPath: entry,
          tsConfigPath: tsconfigFile,
          sourceMap: !prod,
        }),
      new CaseSensitivePathsWebpackPlugin(),
      new CopyWebpackPlugin(
        copies.concat(tryFile(resolve(entry, '../public'))).filter(identify),
      ),
      new FriendlyErrorsWebpackPlugin(),
      prod &&
        new GenerateSW({
          cacheId: pkg.name + (type ? '-' + type : ''),
          clientsClaim: true,
          skipWaiting: true,
          exclude: [/\.map$/, /index.html$/],
          runtimeCaching: [
            {
              urlPattern: /\/api\//,
              handler: 'NetworkFirst',
            },
          ],
        }),
      new HtmlWebpackPlugin({
        title: [pkg.name, pkg.description].filter(identify).join(' - '),
        template,
        alwaysWriteToDisk: true,
        inlineSource: /(^|[\\/])manifest\.\w+\.js$/,
        minify: prod as false,
      }),
      new HtmlWebpackHarddiskPlugin(),
      new HtmlWebpackInlineSourcePlugin(),
      !prod && new LazyCompileWebpackPlugin(),
      new MiniCssExtractPlugin({
        filename: `[name].[${hashType}].css`,
      }),
      vue && new VueLoaderPlugin(),
    ].filter(identify),
    optimization: {
      runtimeChunk: {
        name: 'manifest',
      },
      splitChunks: {
        cacheGroups: {
          vendors: {
            chunks: 'initial',
            name: 'vendors',
            test: NODE_MODULES_REG,
          },
        },
      },
    },
  }

  info('config: %O', config)

  return config
}