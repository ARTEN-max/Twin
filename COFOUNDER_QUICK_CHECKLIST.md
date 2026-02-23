# Cofounder Quick Checklist - Build App in Xcode

Follow these steps to build and test the app on your iPhone.

## Prerequisites
- [ ] Mac with Xcode installed (from App Store)
- [ ] Node.js 20+ installed (https://nodejs.org)
- [ ] pnpm installed (`npm install -g pnpm`)
- [ ] iPhone connected via USB
- [ ] iPhone unlocked and trusted

## Step-by-Step

### 1. Clone & Setup
```bash
git clone <repository-url>
cd Twin-main
bash cofounder-setup.sh
```

Or manually:
```bash
pnpm install
pnpm build --filter=@komuchi/shared
cd apps/mobile
open ios/KomuchiMobile.xcworkspace
```

### 2. Open Xcode
- [ ] Xcode should open automatically
- [ ] If not, run: `open ios/KomuchiMobile.xcworkspace`
- [ ] ⚠️ **Important**: Open `.xcworkspace`, NOT `.xcodeproj`

### 3. Select Scheme
- [ ] In top toolbar, click scheme dropdown (says "No Scheme" or similar)
- [ ] Select **"KomuchiMobile"** from the list
- [ ] If you don't see it, see troubleshooting below

### 4. Select Your iPhone
- [ ] Next to scheme dropdown, click device selector
- [ ] Select **your iPhone** (e.g., "John's iPhone")
- [ ] Make sure it shows your device name, NOT "Any iOS Device"

### 5. Change to Release Mode
- [ ] Menu: **Product** → **Scheme** → **Edit Scheme...**
- [ ] In left sidebar, select **"Run"**
- [ ] Find **"Build Configuration"** dropdown
- [ ] Change from **"Debug"** to **"Release"**
- [ ] Click **"Close"**

### 6. Build & Install
- [ ] Connect iPhone via USB
- [ ] Unlock iPhone
- [ ] Trust computer if prompted
- [ ] Click **Play button** (▶️) in Xcode toolbar
- [ ] Or press **`Cmd + R`**
- [ ] Wait for build (1-2 minutes)

### 7. Test
- [ ] App should install and launch automatically
- [ ] Disconnect iPhone from USB
- [ ] Test the app - it should work independently!

## Troubleshooting

### "No Scheme" or can't find KomuchiMobile scheme
1. Close Xcode
2. Make sure you opened `.xcworkspace` (not `.xcodeproj`)
3. Reopen: `open ios/KomuchiMobile.xcworkspace`
4. Try again

### "Signing for 'KomuchiMobile' requires a development team"
1. Xcode → Settings → Accounts
2. Click "+" → Add your Apple ID
3. Go back to project settings
4. Select your team from dropdown

### Build fails with "No such module"
```bash
cd ios
pod install
```
Then rebuild in Xcode.

### App doesn't install on iPhone
1. Make sure iPhone is unlocked
2. Settings → General → VPN & Device Management
3. Trust your developer certificate
4. Try building again

### Can't see files in Project Navigator
- Make sure you opened `.xcworkspace`, not `.xcodeproj`
- The left sidebar should show "KomuchiMobile" with files underneath

## Success!
✅ If the app launches on your iPhone and works without your laptop, you're done!

## Need Help?
Check `COFOUNDER_TESTING_GUIDE.md` for detailed explanations.
