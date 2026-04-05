Bun.build({
    entrypoints: ["./client.ts"],
    outdir: "./dist",
    target: "bun",
    naming: "[dir]/[name].[ext]",
    splitting: true,
})