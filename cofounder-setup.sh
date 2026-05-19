#!/bin/bash
# Cofounder Setup Script for Twin App
# Makes it easy for your cofounder to build and test the app

set -e  # Exit on error

echo "🚀 Setting up Twin app for testing..."
echo ""

# Check prerequisites
echo "📋 Checking prerequisites..."

if ! command -v xcodebuild &> /dev/null; then
    echo "❌ Xcode not found. Please install Xcode from App Store."
    echo "   https://apps.apple.com/us/app/xcode/id497799835"
    exit 1
fi
echo "✅ Xcode found"

if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Please install Node.js 20+ from https://nodejs.org"
    exit 1
fi
echo "✅ Node.js found: $(node --version)"

if ! command -v pnpm &> /dev/null; then
    echo "⚠️  pnpm not found. Installing globally..."
    npm install -g pnpm
fi
echo "✅ pnpm found: $(pnpm --version)"

# Install dependencies
echo ""
echo "📦 Installing dependencies..."
pnpm install

# Build shared package
echo ""
echo "🔨 Building shared package..."
pnpm build --filter=@twin/shared

# Open Xcode
echo ""
echo "📱 Opening Xcode workspace..."
cd apps/mobile
open ios/TwinMobile.xcworkspace

echo ""
echo "✅ Setup complete!"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📱 Next steps in Xcode:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "1. Select 'TwinMobile' scheme (top toolbar, next to play button)"
echo "2. Select your iPhone from device dropdown"
echo "3. Product → Scheme → Edit Scheme..."
echo "   - Select 'Run' in left sidebar"
echo "   - Change 'Build Configuration' to 'Release'"
echo "   - Click 'Close'"
echo "4. Connect your iPhone via USB and unlock it"
echo "5. Click Play button (▶️) or press Cmd+R"
echo "6. Wait for build to complete (1-2 minutes)"
echo "7. App will install and launch on your iPhone"
echo ""
echo "🎉 Once installed, you can disconnect and test independently!"
echo ""
