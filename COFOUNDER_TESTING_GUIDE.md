# Cofounder Testing Guide

## Option 1: Build on Their Mac (Easiest - No Apple Developer Account Needed)

Your cofounder can build the app themselves, just like you did.

### Prerequisites
- Mac with Xcode installed
- iPhone connected via USB
- Same setup as you did

### Steps

1. **Clone the repository:**
   ```bash
   git clone <your-repo-url>
   cd Twin-main
   ```

2. **Install dependencies:**
   ```bash
   pnpm install
   ```

3. **Build shared package:**
   ```bash
   pnpm build --filter=@komuchi/shared
   ```

4. **Open Xcode:**
   ```bash
   cd apps/mobile
   open ios/KomuchiMobile.xcworkspace
   ```

5. **Build and install:**
   - Select "KomuchiMobile" scheme
   - Select their iPhone
   - Change to Release mode (Product → Scheme → Edit Scheme → Build Configuration → Release)
   - Click Play button (▶️) or press `Cmd + R`
   - Wait for build and install

6. **Test independently:**
   - Disconnect iPhone
   - Test the app

**Pros:** Free, works immediately, no Apple Developer account needed  
**Cons:** Requires Mac + Xcode setup

---

## Option 2: TestFlight (Requires Apple Developer Account)

If you have an Apple Developer account ($99/year), you can use TestFlight for easy distribution.

### Steps

1. **Purchase Apple Developer Account** (if not done yet)

2. **Archive the app:**
   - In Xcode: **Product** → **Archive**
   - Wait for archive to complete

3. **Upload to App Store Connect:**
   - Click **Distribute App**
   - Select **App Store Connect**
   - Follow the wizard to upload

4. **Set up TestFlight:**
   - Go to [App Store Connect](https://appstoreconnect.apple.com)
   - Create app (if not done)
   - Go to **TestFlight** tab
   - Add internal testers (your cofounder's Apple ID email)
   - Wait for processing (1-2 hours)

5. **Cofounder installs:**
   - Cofounder installs **TestFlight** app from App Store
   - Accepts your TestFlight invitation email
   - Installs your app from TestFlight

**Pros:** Easy distribution, works on any iPhone, no USB needed  
**Cons:** Requires Apple Developer account, 1-2 hour processing time

---

## Option 3: Ad-Hoc Distribution (Requires Apple Developer Account)

Distribute the app directly to registered devices.

### Steps

1. **Register cofounder's device:**
   - Get their iPhone's UDID:
     - Settings → General → About → Scroll to find UDID
   - Add device in App Store Connect → Users and Access → Devices

2. **Archive and distribute:**
   - In Xcode: **Product** → **Archive**
   - **Distribute App** → **Ad Hoc**
   - Select registered devices
   - Export .ipa file

3. **Share .ipa file:**
   - Upload .ipa to cloud storage (Dropbox, Google Drive)
   - Share link with cofounder

4. **Cofounder installs:**
   - Download .ipa on their iPhone
   - Install via Finder (Mac) or Apple Configurator
   - Or use a service like Diawi.com

**Pros:** Direct installation, no TestFlight needed  
**Cons:** Requires device registration, more complex setup

---

## Option 4: Share Your Build (Quick but Limited)

If your cofounder has access to your Mac, they can use the build you already created.

### Steps

1. **Export your build:**
   - In Xcode: **Window** → **Organizer**
   - Select your archive
   - **Distribute App** → **Development** or **Ad Hoc**
   - Export .ipa file

2. **Share and install:**
   - Same as Option 3 steps 3-4

**Pros:** Quick if they have Mac access  
**Cons:** Limited to your registered devices

---

## Recommended Approach

**For immediate testing (no Apple Developer account):**
→ **Option 1**: Have cofounder build on their Mac

**For easy distribution (with Apple Developer account):**
→ **Option 2**: Use TestFlight (best long-term solution)

---

## Quick Setup Script for Cofounder (Option 1)

Create this script to make it easier:

```bash
#!/bin/bash
# cofounder-setup.sh

echo "🚀 Setting up Twin app for testing..."

# Check prerequisites
if ! command -v xcodebuild &> /dev/null; then
    echo "❌ Xcode not found. Please install Xcode from App Store."
    exit 1
fi

if ! command -v pnpm &> /dev/null; then
    echo "❌ pnpm not found. Installing..."
    npm install -g pnpm
fi

# Install dependencies
echo "📦 Installing dependencies..."
pnpm install

# Build shared package
echo "🔨 Building shared package..."
pnpm build --filter=@komuchi/shared

# Open Xcode
echo "📱 Opening Xcode..."
cd apps/mobile
open ios/KomuchiMobile.xcworkspace

echo "✅ Setup complete!"
echo ""
echo "Next steps in Xcode:"
echo "1. Select 'KomuchiMobile' scheme"
echo "2. Select your iPhone"
echo "3. Product → Scheme → Edit Scheme → Change to 'Release'"
echo "4. Click Play button (▶️)"
```

Save as `cofounder-setup.sh`, make executable:
```bash
chmod +x cofounder-setup.sh
```

Then cofounder runs:
```bash
./cofounder-setup.sh
```
