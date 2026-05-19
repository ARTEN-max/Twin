import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Clean existing data
  await prisma.job.deleteMany();
  await prisma.debrief.deleteMany();
  await prisma.transcript.deleteMany();
  await prisma.recording.deleteMany();
  await prisma.user.deleteMany();

  // Create demo user (ID matches frontend DEMO_USER in apps/web/src/lib/auth.tsx)
  const demoUser = await prisma.user.create({
    data: {
      id: '91b4d85d-1b51-4a7b-8470-818b75979913',
      email: 'demo@twin.dev',
    },
  });
  console.log(`✅ Created demo user: ${demoUser.email} (ID: ${demoUser.id})`);

  // Create sample recordings (with S3 object keys)
  const recording1 = await prisma.recording.create({
    data: {
      userId: demoUser.id,
      title: 'Weekly Team Standup',
      mode: 'meeting',
      status: 'complete',
      objectKey: `recordings/${demoUser.id}/sample-1/standup.mp3`,
      originalFilename: 'standup.mp3',
      mimeType: 'audio/mpeg',
      fileSize: 5242880, // 5MB
      duration: 1800, // 30 minutes
    },
  });

  const recording2 = await prisma.recording.create({
    data: {
      userId: demoUser.id,
      title: 'Sales Call - Acme Corp',
      mode: 'sales',
      status: 'complete',
      objectKey: `recordings/${demoUser.id}/sample-2/sales-call.mp3`,
      originalFilename: 'sales-call.mp3',
      mimeType: 'audio/mpeg',
      fileSize: 7864320, // 7.5MB
      duration: 2700, // 45 minutes
    },
  });

  const recording3 = await prisma.recording.create({
    data: {
      userId: demoUser.id,
      title: 'Interview - Senior Developer',
      mode: 'interview',
      status: 'processing',
      objectKey: `recordings/${demoUser.id}/sample-3/interview.mp3`,
      originalFilename: 'interview.mp3',
      mimeType: 'audio/mpeg',
      fileSize: 10485760, // 10MB
      duration: 3600, // 60 minutes
    },
  });

  console.log(`✅ Created ${3} sample recordings`);

  // Create transcript for recording 1
  await prisma.transcript.create({
    data: {
      recordingId: recording1.id,
      text: `Good morning everyone. Let's start with our weekly standup. 
      
John, can you start us off?

Sure. Yesterday I finished the authentication module and submitted it for review. Today I'll be working on the dashboard components. No blockers.

Thanks John. Sarah?

I've been working on the API integration. Had some issues with the third-party service but resolved them. Today I'll continue with testing. One blocker - I need access to the staging environment.

I'll get you that access right after this meeting. Mike?

I completed the database migrations and started on the caching layer. Will continue that today. No blockers from my side.

Great progress everyone. Let's sync again tomorrow. Meeting adjourned.`,
      segments: [
        {
          start: 0,
          end: 5,
          text: "Good morning everyone. Let's start with our weekly standup.",
          speaker: 'Host',
        },
        { start: 5, end: 8, text: 'John, can you start us off?', speaker: 'Host' },
        {
          start: 8,
          end: 25,
          text: "Sure. Yesterday I finished the authentication module and submitted it for review. Today I'll be working on the dashboard components. No blockers.",
          speaker: 'John',
        },
        { start: 25, end: 28, text: 'Thanks John. Sarah?', speaker: 'Host' },
        {
          start: 28,
          end: 55,
          text: "I've been working on the API integration. Had some issues with the third-party service but resolved them. Today I'll continue with testing. One blocker - I need access to the staging environment.",
          speaker: 'Sarah',
        },
        {
          start: 55,
          end: 62,
          text: "I'll get you that access right after this meeting. Mike?",
          speaker: 'Host',
        },
        {
          start: 62,
          end: 82,
          text: 'I completed the database migrations and started on the caching layer. Will continue that today. No blockers from my side.',
          speaker: 'Mike',
        },
        {
          start: 82,
          end: 90,
          text: "Great progress everyone. Let's sync again tomorrow. Meeting adjourned.",
          speaker: 'Host',
        },
      ],
      language: 'en',
    },
  });

  // Create debrief for recording 1
  await prisma.debrief.create({
    data: {
      recordingId: recording1.id,
      markdown: `# Weekly Team Standup - Summary

## Overview
Team standup covering progress updates from John, Sarah, and Mike.

## Key Updates

### John
- ✅ Completed authentication module
- 📝 Submitted for code review
- 🎯 Next: Dashboard components

### Sarah  
- 🔧 Working on API integration
- ✅ Resolved third-party service issues
- 🎯 Next: Testing
- ⚠️ **Blocker**: Needs staging environment access

### Mike
- ✅ Completed database migrations
- 🔄 Started caching layer implementation
- 🎯 Next: Continue caching work

## Action Items
1. Grant Sarah access to staging environment (Host - immediate)
2. Review John's authentication PR
3. Schedule next sync for tomorrow`,
      sections: [
        {
          title: 'Overview',
          content: 'Team standup covering progress updates from John, Sarah, and Mike.',
          order: 0,
        },
        {
          title: 'Key Updates',
          content:
            'John completed auth module. Sarah working on API integration with blocker. Mike finished migrations.',
          order: 1,
        },
        {
          title: 'Action Items',
          content: '1. Grant staging access to Sarah\n2. Review auth PR\n3. Schedule next sync',
          order: 2,
        },
      ],
    },
  });

  // Create transcript for recording 2
  await prisma.transcript.create({
    data: {
      recordingId: recording2.id,
      text: `Hello, thank you for taking the time to meet with us today.

Of course, we've been looking forward to learning more about your solution.

Great! Let me walk you through how Twin can transform your team's meeting workflows. We specialize in audio transcription and intelligent debriefing.

That sounds interesting. Our biggest pain point is keeping track of action items from calls.

That's exactly what we solve. After each call, our AI generates a structured debrief with action items, key decisions, and follow-ups automatically assigned.

What's the typical turnaround time?

Usually within 2-3 minutes after the recording ends. Everything is searchable and integrates with your existing tools.

We'd like to start a pilot. What would that look like?

Perfect. We can set you up with a 30-day trial for your sales team. I'll send over the proposal today.`,
      segments: [
        {
          start: 0,
          end: 8,
          text: 'Hello, thank you for taking the time to meet with us today.',
          speaker: 'Sales Rep',
        },
        {
          start: 8,
          end: 16,
          text: "Of course, we've been looking forward to learning more about your solution.",
          speaker: 'Prospect',
        },
        {
          start: 16,
          end: 35,
          text: "Great! Let me walk you through how Twin can transform your team's meeting workflows. We specialize in audio transcription and intelligent debriefing.",
          speaker: 'Sales Rep',
        },
        {
          start: 35,
          end: 45,
          text: 'That sounds interesting. Our biggest pain point is keeping track of action items from calls.',
          speaker: 'Prospect',
        },
        {
          start: 45,
          end: 65,
          text: "That's exactly what we solve. After each call, our AI generates a structured debrief with action items, key decisions, and follow-ups automatically assigned.",
          speaker: 'Sales Rep',
        },
        { start: 65, end: 70, text: "What's the typical turnaround time?", speaker: 'Prospect' },
        {
          start: 70,
          end: 85,
          text: 'Usually within 2-3 minutes after the recording ends. Everything is searchable and integrates with your existing tools.',
          speaker: 'Sales Rep',
        },
        {
          start: 85,
          end: 92,
          text: "We'd like to start a pilot. What would that look like?",
          speaker: 'Prospect',
        },
        {
          start: 92,
          end: 105,
          text: "Perfect. We can set you up with a 30-day trial for your sales team. I'll send over the proposal today.",
          speaker: 'Sales Rep',
        },
      ],
      language: 'en',
    },
  });

  // Create debrief for recording 2
  await prisma.debrief.create({
    data: {
      recordingId: recording2.id,
      markdown: `# Sales Call - Acme Corp

## Call Summary
Introductory sales call with Acme Corp. Strong interest shown, pilot agreed.

## Prospect Pain Points
- Difficulty tracking action items from calls
- Need for better meeting documentation
- Want integration with existing tools

## Value Propositions Discussed
- AI-powered transcription
- Automatic debrief generation
- 2-3 minute turnaround time
- Tool integrations

## Outcome
✅ **Pilot Agreed** - 30-day trial for sales team

## Next Steps
1. Send proposal document today
2. Set up 30-day pilot access
3. Schedule onboarding call
4. Follow up in 1 week`,
      sections: [
        {
          title: 'Summary',
          content: 'Introductory sales call with strong interest. Pilot agreed.',
          order: 0,
        },
        {
          title: 'Pain Points',
          content: 'Action item tracking, meeting documentation, tool integration needs.',
          order: 1,
        },
        { title: 'Outcome', content: 'Pilot agreed - 30-day trial for sales team.', order: 2 },
        {
          title: 'Next Steps',
          content: 'Send proposal, set up pilot, schedule onboarding, follow up in 1 week.',
          order: 3,
        },
      ],
    },
  });

  // Create a pending job for recording 3
  await prisma.job.create({
    data: {
      recordingId: recording3.id,
      type: 'TRANSCRIBE',
      status: 'running',
      startedAt: new Date(),
    },
  });

  console.log(`✅ Created transcripts and debriefs`);
  console.log(`✅ Created sample job`);

  console.log('\n🎉 Seeding complete!\n');
  console.log('Demo credentials:');
  console.log(`  Email: ${demoUser.email}`);
  console.log(`  User ID: ${demoUser.id}`);
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
