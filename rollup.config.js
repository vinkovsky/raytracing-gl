import path from "path";
import babel from "@rollup/plugin-babel";
import resolve from "@rollup/plugin-node-resolve";
import { terser } from "rollup-plugin-terser";
// import glslOptimize from "rollup-plugin-glsl-optimize";

const root = process.platform === "win32" ? path.resolve("/") : "/";
const external = (id) => !id.startsWith(".") && !id.startsWith(root);
const extensions = [".js", ".glsl", ".frag", ".vert"];

const getBabelOptions = ({ useESModules }) => ({
  babelrc: false,
  extensions,
  exclude: "**/node_modules/**",
  babelHelpers: "runtime",
  presets: [
    [
      "@babel/preset-env",
      {
        include: [
          "@babel/plugin-proposal-optional-chaining",
          "@babel/plugin-proposal-nullish-coalescing-operator",
          "@babel/plugin-proposal-numeric-separator",
          "@babel/plugin-proposal-logical-assignment-operators",
        ],
        bugfixes: true,
        loose: true,
        modules: false,
        targets: "> 1%, not dead, not ie 11, not op_mini all",
      },
    ],
    // "@babel/preset-react",
    // "@babel/preset-typescript",
  ],
  plugins: [["@babel/transform-runtime", { regenerator: false, useESModules }]],
});

export default [
  {
    input: "./src/main.js",
    output: {
      file: "build/rt-renderer.js",
      name: "rt-renderer",
      globals: {
        three: "THREE",
      },
      format: "umd",
    },
    external,
    plugins: [
      babel(getBabelOptions({ useESModules: true })),
      resolve({ extensions }),
      terser(),
      // glslOptimize({}),
    ],
  },
];
