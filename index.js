// --- DATABASE INITIALIZATION CONFIGURATION ---
const SUPABASE_URL = "https://atwmletqxypqimnsylrf.supabase.co"; 

// Cut off the last 10 to 15 characters of your real Supabase Anon key and put the remaining long part here
const BASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF0d21sZXRxeHlwcWltbnN5bHJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxNzQzMDcsImV4cCI6MjA5NDc1MDMwN30.HW0x5rDaiTb-qy2X6Nwa-H1RsIMGgnsQWvyOI";

// FIXED: Changed the variable name to 'supabaseDB' to prevent collisions with the CDN global library namespace
let supabaseDB = null;
let savedCustomersList = [];
let itemCounter = 0;

// Regular window initialization
window.onload = function() {
    document.getElementById('invdate').valueAsDate = new Date();
    addInvoiceItemRow(); // Inject an empty row for UI purposes
};

// --- RUNTIME INJECTION LOGIC ---
function initializeSecureConnection() {
    const userSuffixInput = document.getElementById('secretSuffix').value.trim();

    if(!userSuffixInput) {
        alert("Please enter the secret token suffix to unlock the workspace.");
        return;
    }

    // Assemble the fragmented components at runtime
    const completeSecretKey = BASE_ANON_KEY + userSuffixInput;

    try {
        // FIXED: Using the global 'supabase' library object to initialize our custom 'supabaseDB' client
        supabaseDB = supabase.createClient(SUPABASE_URL, completeSecretKey);
        // Run a test call to confirm the assembled key works
        testAndSyncDatabase();
    } catch(err) {
        alert("System error stitching security token keys: " + err.message);
    }
}

async function testAndSyncDatabase() {
    try {
        // Attempt to fetch profiles to verify the key
        const { data, error } = await supabaseDB
            .from('customers')
            .select('*')
            .order('company_name', { ascending: true });

        if (error) throw error;

        savedCustomersList = data;
        renderCustomerDropdownList(data);

        document.getElementById('workspace').classList.add('app-active');
        alert("🔓 Connection established! Customer profiles loaded successfully.");

    } catch(err) {
        console.error(err);
        alert("🚫 Invalid Secret Suffix Code. Database connection rejected.");
        document.getElementById('workspace').classList.remove('app-active');
    }
}

function renderCustomerDropdownList(data) {
    const selector = document.getElementById('customerSelect');
    selector.innerHTML = '<option value="">-- Select or Start Typing a Saved Customer --</option>';

    data.forEach(customer => {
        let option = document.createElement('option');
        option.value = customer.id;
        option.textContent = `${customer.company_name} (${customer.state || 'N/A'})`;
        selector.appendChild(option);
    });
}

// --- DATA ACCESS OPERATIONS (CRUD METADATA) ---

function autoFillCustomerMetadata() {
    const selectedId = document.getElementById('customerSelect').value;
    if (!selectedId) return;

    const profile = savedCustomersList.find(c => c.id === selectedId);
    if (profile) {
        document.getElementById('billto').value = profile.company_name || '';
        document.getElementById('address').value = profile.address || '';
        document.getElementById('gstin').value = profile.gstin || '';
        document.getElementById('state').value = profile.state || '';
        document.getElementById('statecode').value = profile.state_code || '';
    }
}

async function saveCurrentCustomerMetadata() {
    const companyName = document.getElementById('billto').value.trim();
    if (!companyName) {
        alert("Company Name is required to save metadata profile.");
        return;
    }

    const metadataPayload = {
        company_name: companyName,
        address: document.getElementById('address').value,
        gstin: document.getElementById('gstin').value,
        state: document.getElementById('state').value,
        state_code: document.getElementById('statecode').value
    };

    try {
        const { error } = await supabaseDB
            .from('customers')
            .upsert(metadataPayload, { onConflict: 'company_name' });

        if (error) throw error;

        alert(`Successfully saved and updated metadata for: ${companyName}`);

        // Refresh local cache profiles
        const { data } = await supabaseDB.from('customers').select('*').order('company_name', { ascending: true });
        savedCustomersList = data;
        renderCustomerDropdownList(data);
    } catch (err) {
        alert("Failed saving customer context: " + err.message);
    }
}

// --- LINE ITEMS INVOICE ENGINE ---

function addInvoiceItemRow() {
    itemCounter++;
    const container = document.getElementById('itemsContainer');

    const rowHtml = `
        <div class="item-box" id="row_${itemCounter}">
            <h4 style="margin: 0 0 10px 0;">Item Sequence Unit #${itemCounter}</h4>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px;">
                <div>
                    <label style="font-size:12px;">Description</label>
                    <input type="text" class="item-desc" placeholder="Product Name">
                </div>
                <div>
                    <label style="font-size:12px;">HSN/SAC</label>
                    <input type="text" class="item-hsn" placeholder="Code">
                </div>
                <div>
                    <label style="font-size:12px;">Quantity</label>
                    <input type="number" class="item-qty" value="1" step="0.01">
                </div>
                <div>
                    <label style="font-size:12px;">Unit Rate</label>
                    <input type="number" class="item-rate" value="0.00" step="0.01">
                </div>
            </div>
            <button type="button" style="background-color:#C0392B; padding:5px 10px; font-size:11px; margin-top:10px; color:white;"
                onclick="removeItemRow(${itemCounter})">Delete Row</button>
        </div>
    `;
    container.insertAdjacentHTML('beforeend', rowHtml);
}

function removeItemRow(id) {
    const targetElement = document.getElementById(`row_${id}`);
    if(targetElement) targetElement.remove();
}

// --- RENDERING ENGINE (jsPDF WRAPPER) ---

function generateInvoicePDF() {
    const doc = new jsPDF();

    const clientName = document.getElementById('billto').value || 'N/A';
    const clientAddr = document.getElementById('address').value || 'N/A';
    const clientGst = document.getElementById('gstin').value || 'N/A';
    const invoiceNum = document.getElementById('invno').value || 'N/A';
    const invoiceDate = document.getElementById('invdate').value || 'N/A';

    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.text("TAX INVOICE", 14, 25);

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Invoice No: ${invoiceNum}`, 140, 20);
    doc.text(`Date: ${invoiceDate}`, 140, 25);

    doc.line(14, 32, 196, 32);

    doc.setFont("helvetica", "bold");
    doc.text("BILLED TO:", 14, 42);
    doc.setFont("helvetica", "normal");
    doc.text(`Company: ${clientName}`, 14, 48);
    doc.text(`Address: ${clientAddr}`, 14, 54);
    doc.text(`GSTIN: ${clientGst}`, 14, 60);

    doc.line(14, 66, 196, 66);

    const boxes = document.querySelectorAll('.item-box');
    let yPosition = 80;

    doc.setFont("helvetica", "bold");
    doc.text("Item Details", 14, 75);
    doc.text("Qty", 120, 75);
    doc.text("Rate", 150, 75);
    doc.text("Total Amount", 170, 75);
    doc.setFont("helvetica", "normal");

    let baseTaxableSubtotal = 0;

    boxes.forEach((box) => {
        const desc = box.querySelector('.item-desc').value || 'Item/Service Line';
        const qty = parseFloat(box.querySelector('.item-qty').value) || 0;
        const rate = parseFloat(box.querySelector('.item-rate').value) || 0;
        const total = qty * rate;
        baseTaxableSubtotal += total;

        doc.text(desc, 14, yPosition);
        doc.text(qty.toString(), 120, yPosition);
        doc.text(rate.toFixed(2), 150, yPosition);
        doc.text(total.toFixed(2), 170, yPosition);

        yPosition += 8;
    });

    yPosition += 5;
    doc.line(14, yPosition, 196, yPosition);
    yPosition += 8;

    let otherCharges = parseFloat(document.getElementById('otherchg').value) || 0;
    let finalTotal = baseTaxableSubtotal + otherCharges;

    doc.text(`Subtotal Amount: ${baseTaxableSubtotal.toFixed(2)}`, 130, yPosition);
    yPosition += 6;

    if(otherCharges > 0) {
        doc.text(`Other Charges: ${otherCharges.toFixed(2)}`, 130, yPosition);
        yPosition += 6;
    }

    if (document.getElementById('igstq').checked) {
        let igst = baseTaxableSubtotal * 0.18;
        finalTotal += igst;
        doc.text(`IGST (18%): ${igst.toFixed(2)}`, 130, yPosition);
        yPosition += 6;
    } else if (document.getElementById('cgstsgstq').checked) {
        let cgst = baseTaxableSubtotal * 0.09;
        let sgst = baseTaxableSubtotal * 0.09;
        finalTotal += (cgst + sgst);
        doc.text(`CGST (9%): ${cgst.toFixed(2)}`, 130, yPosition);
        yPosition += 6;
        doc.text(`SGST (9%): ${sgst.toFixed(2)}`, 130, yPosition);
        yPosition += 6;
    }

    doc.setFont("helvetica", "bold");
    doc.text(`GRAND TOTAL: INR ${finalTotal.toFixed(2)}`, 130, yPosition);

    doc.save(`Invoice_${invoiceNum}.pdf`);
}