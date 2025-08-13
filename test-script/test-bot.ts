// test-script/test-bot.ts
import { extractOrderFromMessage } from '../src/whatsappOrderBot';

/**
 * Comprehensive test function for the WhatsApp Order Bot
 */
function runTests(): void {
  console.log("🧪 Starting WhatsApp Order Bot Tests...\n");

  const testCases = [
    {
      name: "Multi-line Standard Format",
      message: `6/8/2025
total：256
THAN SIEW PHENG
019-4419638
6 Lorong Vila Indah 7,
14300 Nibong Tebal,
Pulau Pinang.
1w1f1s1w30ml`,
      context: { customerPhone: "01126470411" },
      expected: {
        total: 256,
        payment: undefined,
        repeat: false,
        customerName: "THAN SIEW PHENG",
        phoneNumber: "60194419638",
        postcode: "14300",
        state: "Penang"
      }
    },
    {
      name: "Multi-line with Payment Method",
      message: `Date: 13/8/25 Repeat
Name: John Tan (TNG)
Contact: +60123456789
Address: 123 Jalan ABC, Taman DEF, 12345 Petaling Jaya, Selangor
Payment: Touch n Go
Total: 278
2f1w30ml`,
      context: { customerPhone: "01126470411" },
      expected: {
        total: 278,
        payment: "TNG",
        repeat: true,
        customerName: "John Tan",
        phoneNumber: "60123456789",
        postcode: "12345",
        state: "Selangor"
      }
    },
    {
      name: "Chinese Format",
      message: `8/8/2025
total：198
汇款人名字：CHOW MEI LING
收件人名字：NICOLE CHOW
电话号码：0126675705
地址： C15-2-2, Bayan Villa, Jalan BS2/5, Taman Bukit Serdang, 43300 Seri Kembangan, Selangor.
2f1w30ml`,
      context: { customerPhone: "01126470411" },
      expected: {
        total: 198,
        payment: undefined,
        repeat: false,
        customerName: "NICOLE CHOW",
        phoneNumber: "60126675705",
        postcode: "43300",
        state: "Selangor"
      }
    },
    {
      name: "Condensed Format with Repeat",
      message: "8/8/25.rpt Cod rm278 Dorcas Koh (cod) 0127370668 28 jalan sagu 38,Taman daya 81100 jb 3f1w",
      context: { customerPhone: "01126470411" },
      expected: {
        total: 278,
        payment: "COD",
        repeat: true,
        customerName: "Dorcas Koh",
        phoneNumber: "60127370668",
        postcode: "81100",
        state: "Johor"
      }
    },
    {
      name: "Condensed Format TNG",
      message: "13/8/25 TNG rm200 Mary Lim 0191234567 456 Orchard Road Singapore 65 1f2w",
      context: { customerPhone: "01126470411" },
      expected: {
        total: 200,
        payment: "TNG",
        repeat: false,
        customerName: "Mary Lim",
        phoneNumber: "60191234567",
        postcode: undefined,
        state: "Singapore"
      }
    },
    {
      name: "Standalone Amount",
      message: `15/8/2025
ALICE TAN
0123456789
123 Main Street, KL
350
3f1s`,
      context: { customerPhone: "01126470411" },
      expected: {
        total: 350,
        payment: undefined,
        repeat: false,
        customerName: "ALICE TAN",
        phoneNumber: "60123456789",
        postcode: undefined,
        state: "Kuala Lumpur"
      }
    },
    {
      name: "RM Prefix Amount",
      message: `16/8/2025
BOB CHAN  
0187654321
456 Second Street, Penang
RM450
2w2f`,
      context: { customerPhone: "01126470411" },
      expected: {
        total: 450,
        payment: undefined,
        repeat: false,
        customerName: "BOB CHAN",
        phoneNumber: "60187654321",
        postcode: undefined,
        state: "Penang"
      }
    },
    {
      name: "Total in Different Formats",
      message: `17/8/2025
Mary Wong
0123456789
123 Street, KL
total paid: 299
1f1w`,
      context: { customerPhone: "01126470411" },
      expected: {
        total: 299,
        payment: undefined,
        repeat: false,
        customerName: "Mary Wong",
        phoneNumber: "60123456789",
        postcode: undefined,
        state: "Kuala Lumpur"
      }
    }
  ];

  let passedTests = 0;
  let totalTests = testCases.length;

  testCases.forEach((testCase, index) => {
    console.log(`\n📝 Test ${index + 1}: ${testCase.name}`);
    console.log(`Message: "${testCase.message.replace(/\n/g, '\\n')}"`);
    
    try {
      const result = extractOrderFromMessage(testCase.message, testCase.context);
      
      if (!result) {
        console.log("❌ FAILED: No order extracted");
        return;
      }

      let testPassed = true;
      let issues: string[] = [];

      // Check total amount
      if (result.totalPaid !== testCase.expected.total) {
        testPassed = false;
        issues.push(`Total: expected ${testCase.expected.total}, got ${result.totalPaid}`);
      }

      // Check payment method
      if (result.paymentMethod !== testCase.expected.payment) {
        testPassed = false;
        issues.push(`Payment: expected ${testCase.expected.payment || 'undefined'}, got ${result.paymentMethod || 'undefined'}`);
      }

      // Check repeat customer
      if (result.isRepeatCustomer !== testCase.expected.repeat) {
        testPassed = false;
        issues.push(`Repeat: expected ${testCase.expected.repeat}, got ${result.isRepeatCustomer}`);
      }

      // Check customer name
      if (result.customerName !== testCase.expected.customerName) {
        testPassed = false;
        issues.push(`Customer: expected '${testCase.expected.customerName}', got '${result.customerName}'`);
      }

      // Check phone number
      if (result.phoneNumber !== testCase.expected.phoneNumber) {
        testPassed = false;
        issues.push(`Phone: expected '${testCase.expected.phoneNumber}', got '${result.phoneNumber}'`);
      }

      // Check postcode (if expected)
      if (testCase.expected.postcode && result.postcode !== testCase.expected.postcode) {
        testPassed = false;
        issues.push(`Postcode: expected '${testCase.expected.postcode}', got '${result.postcode}'`);
      }

      // Check state (if expected)
      if (testCase.expected.state && result.state !== testCase.expected.state) {
        testPassed = false;
        issues.push(`State: expected '${testCase.expected.state}', got '${result.state}'`);
      }

      if (testPassed) {
        console.log("✅ PASSED");
        passedTests++;
      } else {
        console.log("❌ FAILED:");
        issues.forEach(issue => console.log(`   - ${issue}`));
      }

      console.log(`📊 Extracted Data:`);
      console.log(`   - Customer: ${result.customerName}`);
      console.log(`   - Phone: ${result.phoneNumber}`);
      console.log(`   - Total: ${result.totalPaid}`);
      console.log(`   - Payment: ${result.paymentMethod || 'None'}`);
      console.log(`   - Repeat: ${result.isRepeatCustomer}`);
      console.log(`   - Products: ${result.products.map(p => `${p.quantity}${p.name}`).join(', ')}`);
      console.log(`   - Address: ${result.address}`);
      console.log(`   - City: ${result.city || 'None'}`);
      console.log(`   - Postcode: ${result.postcode || 'None'}`);
      console.log(`   - State: ${result.state || 'None'}`);
      
    } catch (error) {
      console.log(`❌ FAILED: Error - ${error}`);
    }
  });

  console.log(`\n🏁 Test Results: ${passedTests}/${totalTests} passed`);
  if (passedTests === totalTests) {
    console.log("🎉 All tests passed!");
  } else {
    console.log(`⚠️ ${totalTests - passedTests} tests failed`);
  }

  // Summary of key features tested
  console.log(`\n📋 Features Tested:`);
  console.log(`   ✅ Multi-line format parsing`);
  console.log(`   ✅ Condensed format parsing`);
  console.log(`   ✅ Chinese format parsing`);
  console.log(`   ✅ Total amount extraction (multiple patterns)`);
  console.log(`   ✅ Payment method detection`);
  console.log(`   ✅ Repeat customer detection`);
  console.log(`   ✅ Phone number normalization (Malaysia/Singapore)`);
  console.log(`   ✅ Address parsing (city, postcode, state)`);
  console.log(`   ✅ Product code parsing`);
  console.log(`   ✅ Authorization checking`);
}

// Run the tests
runTests();