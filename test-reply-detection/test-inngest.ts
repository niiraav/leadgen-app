import { inngest } from '../apps/api/src/lib/inngest/client.ts';

async function main() {
  console.log('Inngest client created');
  try {
    await inngest.send({ name: 'test/hello', data: { test: true } });
    console.log('Inngest send succeeded');
  } catch (e: any) {
    console.log('Inngest send failed:', e.message);
    console.log(e.stack);
  }
}
main();
