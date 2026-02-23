# Pre-App Store Submission Checklist

## ✅ Current Status
- [x] Production build working independently
- [x] App connects to Railway API
- [x] Recording functionality works
- [x] Transcription processing works
- [x] All backend services deployed (API, Worker, Diarization, MinIO)

## 🧪 Testing Phase (1-2 days)

### Core Functionality
- [ ] **Recording**: Record audio, stop, upload
- [ ] **Processing**: Wait for transcription to complete
- [ ] **Transcription**: View transcript with speaker labels (YOU/OTHER)
- [ ] **Debrief**: View AI-generated debrief
- [ ] **Chat**: Test chat functionality
- [ ] **Voice Profile**: Test enrollment (if using diarization)

### Edge Cases
- [ ] **Network**: Test on WiFi and cellular data
- [ ] **Offline**: Test behavior when offline (should show errors gracefully)
- [ ] **Long recordings**: Test with 10+ minute recordings
- [ ] **Multiple recordings**: Create several recordings in a row
- [ ] **App backgrounding**: Record, background app, return to app

### UI/UX
- [ ] **Navigation**: All screens accessible and working
- [ ] **Loading states**: Spinners show during processing
- [ ] **Error messages**: Clear, user-friendly error messages
- [ ] **Empty states**: Proper messages when no recordings

## 📱 App Store Preparation

### 1. Apple Developer Account
- [ ] Purchase Apple Developer Program ($99/year)
- [ ] Enroll at: https://developer.apple.com/programs/
- [ ] Wait for approval (usually instant, but can take 24-48 hours)

### 2. App Store Connect Setup
- [ ] Create App Store Connect account
- [ ] Create new app listing:
  - App Name: "Komuchi" (or your chosen name)
  - Bundle ID: `com.komuchi.mobile` (already set)
  - Primary Language: English
  - SKU: Unique identifier (e.g., "komuchi-001")

### 3. App Information
- [ ] **App Icon**: 1024x1024px PNG (no transparency)
- [ ] **Screenshots**: Required for iPhone (6.7", 6.5", 5.5" displays)
- [ ] **App Description**: Write compelling description
- [ ] **Keywords**: SEO keywords for App Store search
- [ ] **Privacy Policy URL**: Required (host on your website or Railway)
- [ ] **Support URL**: Your support email/website
- [ ] **Category**: Productivity, Business, or Utilities

### 4. Build & Archive
- [ ] In Xcode: **Product** → **Archive**
- [ ] Wait for archive to complete
- [ ] **Distribute App** → **App Store Connect**
- [ ] Upload build (takes 10-30 minutes)
- [ ] Wait for processing (can take 1-2 hours)

### 5. App Store Review
- [ ] Submit for review
- [ ] Fill out review information:
  - Demo account credentials (if needed)
  - Notes for reviewer
  - Contact information
- [ ] Wait for review (typically 24-48 hours)

## 🔧 Technical Requirements

### Code Signing
- [ ] Automatic signing enabled in Xcode
- [ ] Valid provisioning profile
- [ ] Distribution certificate created

### App Store Guidelines Compliance
- [ ] **Privacy**: Privacy policy accessible
- [ ] **Permissions**: Microphone permission clearly explained
- [ ] **Content**: No inappropriate content
- [ ] **Functionality**: App works as described
- [ ] **Metadata**: Accurate app description

### Backend Readiness
- [ ] Railway services are stable
- [ ] API endpoints are production-ready
- [ ] Error handling is robust
- [ ] Rate limiting configured
- [ ] Monitoring/logging in place

## 📋 Before Submitting

### Final Checks
- [ ] Test on multiple devices (if possible)
- [ ] Test on different iOS versions (15.1+)
- [ ] Verify all API endpoints work
- [ ] Check for crashes in Xcode console
- [ ] Verify app doesn't leak memory
- [ ] Test with poor network conditions

### Documentation
- [ ] Update README with production setup
- [ ] Document environment variables
- [ ] Create deployment runbook
- [ ] Document known issues/limitations

## 🚀 After Submission

1. **Monitor App Store Connect** for review status
2. **TestFlight** (optional): Invite beta testers while waiting
3. **Prepare marketing**: App Store screenshots, social media posts
4. **Monitor production**: Watch Railway logs, error tracking

## ⚠️ Common Issues

### Build Errors
- **"No signing certificate"**: Add Apple ID in Xcode Settings → Accounts
- **"Provisioning profile mismatch"**: Clean build folder, rebuild
- **"Invalid bundle identifier"**: Check it matches App Store Connect

### Review Rejections
- **Missing privacy policy**: Add privacy policy URL
- **App crashes**: Fix crashes, resubmit
- **Misleading metadata**: Ensure description matches functionality

---

**Timeline Estimate:**
- Testing: 1-2 days
- Apple Developer setup: 1 day
- App Store Connect setup: 2-4 hours
- Build & upload: 1-2 hours
- Review wait: 1-2 days
- **Total: ~1 week from start to App Store**
