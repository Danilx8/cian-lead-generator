/** @type {import("ts-jest").JestConfigWithTsJest} **/
module.exports = {
  preset: "ts-jest", // ← ДОБАВЬТЕ ЭТУ СТРОКУ
  testEnvironment: "node",
  transform: {
    "^.+\.tsx?$": ["ts-jest", {}]
  },
  // Добавьте эти строки:
  testMatch: [
    "**"
  ],
  setupFiles: ["<rootDir>/jest.setup.ts"],
  testPathIgnorePatterns: [
    "/node_modules/",
    "/dist/",
    "/build/",
    "/out/"
  ],
  modulePathIgnorePatterns: [
    "/dist/",
    "/build/",
    "/out/"
  ]

};