const path = require("path");
const fs = require("fs");
const { analyzeProject, formatMigrationReport } = require(
    "../.aios-core/infrastructure/scripts/documentation-integrity/brownfield-analyzer",
);

try {
    const targetDir = path.resolve(__dirname, ".."); // Analyze project root
    console.log(`Analyzing directory: ${targetDir}`);
    const analysis = analyzeProject(targetDir);
    const report = formatMigrationReport(analysis);
    fs.writeFileSync(
        path.join(targetDir, "brownfield_report_utf8.txt"),
        report,
        "utf8",
    );
    console.log("Report written to brownfield_report_utf8.txt");
} catch (error) {
    console.error("Error running analysis:", error);
    process.exit(1);
}
