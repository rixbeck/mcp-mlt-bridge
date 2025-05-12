const path = require('path');

/** @type {import('webpack').Configuration} */
const config = {
  target: 'node',
  mode: process.env.NODE_ENV === 'production' ? 'production' : 'development',
  entry: {
    'extension': './src/extension.ts',
    'test/runTest': './src/test/runTest.ts',
    'test/suite/index': './src/test/suite/index.ts',
    'test/suite/extension.test': './src/test/suite/extension.test.ts',
    'test/suite/extensionRegistry.test': './src/test/suite/extensionRegistry.test.ts',
    'test/suite/commandExecutor.test': './src/test/suite/commandExecutor.test.ts',
    'test/suite/sseServer.test': './src/test/suite/sseServer.test.ts'
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js',
    libraryTarget: 'commonjs2'
  },
  externals: {
    vscode: 'commonjs vscode',
    ws: 'commonjs ws',
    mocha: 'commonjs mocha'
  },
  resolve: {
    extensions: ['.ts', '.js'],
    modules: [
      'node_modules',
      path.resolve(__dirname, 'src')
    ],
    alias: {
      'vscode': path.resolve(__dirname, 'src/test/suite/mockVscode.ts')
    }
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [
          {
            loader: 'ts-loader',
            options: {
              configFile: 'tsconfig.json',
              projectReferences: true
            }
          }
        ]
      }
    ]
  },
  devtool: 'nosources-source-map',
  infrastructureLogging: {
    level: "log",
  },
  node: {
    __dirname: false,
    __filename: false
  }
};

module.exports = config;