import path from "path";
import babel from "@rollup/plugin-babel";
import resolve from "@rollup/plugin-node-resolve";
import { terser } from "rollup-plugin-terser";

const root = process.platform === "win32" ? path.resolve("/") : "/";
const external = (id) => !id.startsWith(".") && !id.startsWith(root);
const extensions = [".js", ".jsx", ".ts", ".tsx", ".glsl", ".frag", ".vert"];

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
    "@babel/preset-react",
    "@babel/preset-typescript",
  ],
  plugins: [["@babel/transform-runtime", { regenerator: false, useESModules }]],
});

export default [
  {
    input: "./src/main.js",
    output: {
      file: "dist/raytracing-gl.js",
      name: "raytracing-gl",
      globals: {
        three: "THREE",
      },
      format: "umd",
    },
    external,
    plugins: [
      babel(getBabelOptions({ useESModules: false })),
      resolve({ extensions }),
      terser(),
    ],
  },
  {
    input: "./src/wrapper.tsx",
    output: {
      file: "dist/react-raytracing-gl.js",
      name: "react-raytracing-gl",
      format: "esm",
    },
    external,
    plugins: [
      babel(getBabelOptions({ useESModules: true })),
      resolve({ extensions }),
      terser(),
    ],
  },
];
