#!/bin/bash

echo "=========================================="
echo "Aylas Core - Implementation Verification"
echo "=========================================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

check_file() {
  if [ -f "$1" ]; then
    echo -e "${GREEN}✓${NC} $1"
  else
    echo -e "${RED}✗${NC} $1 (missing)"
    exit 1
  fi
}

check_dir() {
  if [ -d "$1" ]; then
    echo -e "${GREEN}✓${NC} $1/"
  else
    echo -e "${RED}✗${NC} $1/ (missing)"
    exit 1
  fi
}

echo "Checking project structure..."
echo ""

# Root files
check_file "package.json"
check_file "tsconfig.json"
check_file "jest.config.js"
check_file ".eslintrc.js"
check_file ".env.example"
check_file "README.md"
check_file "IMPLEMENTATION.md"
check_file "QUICK_START.md"
check_file "PHASE3_SUMMARY.md"

echo ""
echo "Checking source structure..."
echo ""

# Config
check_dir "src/config"
check_file "src/config/types.ts"
check_file "src/config/tenant.ts"

# Utils
check_dir "src/utils"
check_file "src/utils/errors.ts"
check_file "src/utils/logger.ts"
check_file "src/utils/retry.ts"

# M1
check_dir "src/modules/m1-normalizer"
check_file "src/modules/m1-normalizer/normalizer.ts"
check_file "src/modules/m1-normalizer/index.ts"
check_file "src/modules/m1-normalizer/__tests__/normalizer.test.ts"

# M2
check_dir "src/modules/m2-multimodal"
check_file "src/modules/m2-multimodal/processor.ts"
check_file "src/modules/m2-multimodal/providers.ts"
check_file "src/modules/m2-multimodal/index.ts"
check_file "src/modules/m2-multimodal/__tests__/processor.test.ts"

# M3
check_dir "src/modules/m3-contact"
check_file "src/modules/m3-contact/manager.ts"
check_file "src/modules/m3-contact/baserow-client.ts"
check_file "src/modules/m3-contact/index.ts"
check_file "src/modules/m3-contact/__tests__/manager.test.ts"

# M4
check_dir "src/modules/m4-router"
check_file "src/modules/m4-router/router.ts"
check_file "src/modules/m4-router/index.ts"
check_file "src/modules/m4-router/__tests__/router.test.ts"

# M5
check_dir "src/modules/m5-logger"
check_file "src/modules/m5-logger/logger.ts"
check_file "src/modules/m5-logger/policy-engine.ts"
check_file "src/modules/m5-logger/index.ts"
check_file "src/modules/m5-logger/__tests__/logger.test.ts"
check_file "src/modules/m5-logger/__tests__/policy-engine.test.ts"

# Integration tests
check_file "src/__tests__/integration.test.ts"

# Main export
check_file "src/index.ts"

echo ""
echo "=========================================="
echo -e "${GREEN}All files verified successfully!${NC}"
echo "=========================================="
echo ""

# Count stats
total_ts=$(find src -name "*.ts" -not -path "*/node_modules/*" | wc -l)
test_files=$(find src -name "*.test.ts" | wc -l)
prod_files=$((total_ts - test_files))

echo "Statistics:"
echo "  Total TypeScript files: $total_ts"
echo "  Production files: $prod_files"
echo "  Test files: $test_files"
echo ""

echo "Next steps:"
echo "  1. npm install"
echo "  2. npm run build"
echo "  3. npm test"
echo ""
