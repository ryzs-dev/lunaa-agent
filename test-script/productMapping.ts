// productMappingTest.ts - Test the exact product mappings

// Test product code parsing with your specific mappings
function testProductCodeParsing() {
  console.log("🧪 Testing Product Code Mappings\n");
  console.log("Product Legend:");
  console.log("W = wash (regular wash column)");
  console.log("F = femlift (Femlift 30ml column - default)");
  console.log("S = spray (Spray column)");
  console.log("W30ml = 小瓶wash (Wash 30ml column)");
  console.log("F10ml = 小瓶femlift (Femlift 10ml column)\n");

  const testCases = [
    {
      input: "1w1f1s1w30ml",
      description:
        "Original sample - 1 wash, 1 femlift 30ml, 1 spray, 1 wash 30ml",
      expected: [
        { name: "wash", quantity: 1, type: "" },
        { name: "femlift_30ml", quantity: 1, type: "30ml" },
        { name: "spray", quantity: 1, type: "" },
        { name: "wash_30ml", quantity: 1, type: "30ml" },
      ],
    },
    {
      input: "2w1f",
      description: "Simple case - 2 wash, 1 femlift 30ml",
      expected: [
        { name: "wash", quantity: 2, type: "" },
        { name: "femlift_30ml", quantity: 1, type: "30ml" },
      ],
    },
    {
      input: "1f10ml2s",
      description: "Small femlift - 1 femlift 10ml, 2 spray",
      expected: [
        { name: "femlift_10ml", quantity: 1, type: "10ml" },
        { name: "spray", quantity: 2, type: "" },
      ],
    },
    {
      input: "3w2w30ml1f1f10ml2s",
      description:
        "Complex mix - 3 wash, 2 wash 30ml, 1 femlift 30ml, 1 femlift 10ml, 2 spray",
      expected: [
        { name: "wash", quantity: 3, type: "" },
        { name: "wash_30ml", quantity: 2, type: "30ml" },
        { name: "femlift_30ml", quantity: 1, type: "30ml" },
        { name: "femlift_10ml", quantity: 1, type: "10ml" },
        { name: "spray", quantity: 2, type: "" },
      ],
    },
  ];

  testCases.forEach((testCase, index) => {
    console.log(`\n🧪 Test Case ${index + 1}: ${testCase.input}`);
    console.log(`Description: ${testCase.description}`);

    const result = parseProductCode(testCase.input);

    console.log("Expected:", testCase.expected);
    console.log("Got:     ", result);

    const matches =
      JSON.stringify(result) === JSON.stringify(testCase.expected);
    console.log(matches ? "✅ PASS" : "❌ FAIL");
  });
}

// Product parsing function (same as in main code)
function parseProductCode(productCode: string) {
  const products: any[] = [];
  let remaining = productCode.replace(/\s/g, "").toLowerCase();

  while (remaining.length > 0) {
    // Try to match patterns in order of specificity
    let match = remaining.match(/^(\d+)([wfs])(30ml|10ml)/i);

    if (!match) {
      match = remaining.match(/^(\d+)([wfs])/i);
    }

    if (!match) {
      console.log(`❌ No match for: "${remaining}"`);
      break;
    }

    const quantity = parseInt(match[1]);
    const productLetter = match[2].toLowerCase();
    const size = match[3] || "";

    switch (productLetter) {
      case "w":
        if (size === "30ml") {
          products.push({ name: "wash_30ml", quantity, type: "30ml" });
        } else {
          products.push({ name: "wash", quantity, type: "" });
        }
        break;
      case "f":
        if (size === "10ml") {
          products.push({ name: "femlift_10ml", quantity, type: "10ml" });
        } else {
          products.push({ name: "femlift_30ml", quantity, type: "30ml" });
        }
        break;
      case "s":
        products.push({ name: "spray", quantity, type: "" });
        break;
    }

    remaining = remaining.substring(match[0].length);
  }

  return products;
}

// Test sheet mapping
function testSheetMapping() {
  console.log("\n\n📊 Testing Google Sheets Column Mapping\n");

  const headers = [
    "No",
    "Order Date",
    "fbname",
    "Name",
    "Payment method",
    "wash",
    "Femlift 30ml",
    "Femlift 10ml",
    "Wash 30ml",
    "Spray",
    "remark",
    "package (rm)",
    "Postage (rm)",
    "Website/shopee charges (rm)",
    "TOTAL PAID (rm)",
    "shipment description",
    "address",
    "city",
    "postcode",
    "state",
    "phone number",
    "tracking number",
    "courires company",
    "new/repeat",
    "cash sale receipt",
    "Agent by / under",
    "sql system",
    "currency",
    "status",
  ];

  const mockOrder = {
    orderDate: "2025-08-06",
    customerName: "THAN SIEW PHENG",
    phoneNumber: "60194419638",
    totalPaid: 256,
    products: [
      { name: "wash", quantity: 1, type: "" }, // → wash column
      { name: "femlift_30ml", quantity: 1, type: "30ml" }, // → Femlift 30ml column
      { name: "spray", quantity: 1, type: "" }, // → Spray column
      { name: "wash_30ml", quantity: 1, type: "30ml" }, // → Wash 30ml column
    ],
    address: "6 Lorong Vila Indah 7,\n14300 Nibong Tebal,\nPulau Pinang.",
    city: "Nibong Tebal",
    postcode: "14300",
    state: "Penang",
    remark: "Order from WhatsApp",
  };

  console.log("Expected mappings:");
  console.log("wash column = 1");
  console.log("Femlift 30ml column = 1");
  console.log("Spray column = 1");
  console.log("Wash 30ml column = 1");
  console.log("TOTAL PAID (rm) column = 256");
  console.log("Name column = THAN SIEW PHENG");
  console.log("phone number column = 60194419638");
  console.log("address column = [full address]");
  console.log("city column = Nibong Tebal");
  console.log("postcode column = 14300");
  console.log("state column = Penang");
}

// Run tests
testProductCodeParsing();
testSheetMapping();
