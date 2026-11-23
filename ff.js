const CUSTOMER_KEY = "ispBillingCustomers";
const PAYMENT_KEY = "ispBillingPayments";
const DAYS_BY_MONTHS = { 1: 30, 3: 90, 6: 182, 12: 365 };
const RESET_PIN = "1234";

const demoCustomers = [
    { id: "1", username: "aarav.sharma", name: "Aarav Sharma", phone: "9800000001", plan: "100 Mbps", months: 1, fee: 2500, status: "Paid", installDate: "2026-10-30", paymentDate: "2026-11-20", dueDate: "2026-11-30" },
    { id: "2", username: "sita.karki", name: "Sita Karki", phone: "9800000002", plan: "50 Mbps", months: 3, fee: 1800, status: "Pending", installDate: "2026-08-25", paymentDate: "", dueDate: "2026-11-25" },
    { id: "3", username: "rohan.traders", name: "Rohan Traders", phone: "9800000003", plan: "200 Mbps", months: 12, fee: 5000, status: "Overdue", installDate: "2025-11-10", paymentDate: "", dueDate: "2026-11-10" },
    { id: "4", username: "maya.gurung", name: "Maya Gurung", phone: "9800000004", plan: "30 Mbps", months: 6, fee: 1200, status: "Paid", installDate: "2026-06-02", paymentDate: "2026-11-21", dueDate: "2026-12-02" },
    { id: "5", username: "bikash.hotel", name: "Bikash Hotel", phone: "9800000005", plan: "80 Mbps", months: 1, fee: 2500, status: "Pending", installDate: "2026-10-28", paymentDate: "", dueDate: "2026-11-28" }
];

function toLocalDateTime(value) {
    if (!value) return "";
    const text = String(value);
    return text.includes("T") ? text.slice(0, 16) : `${text.slice(0, 10)}T00:00`;
}

function localDateTime(date = new Date()) {
    const pad = (part) => String(part).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function expiryDate(installedAt, months) {
    const date = new Date(installedAt);
    const days = DAYS_BY_MONTHS[Number(months)];
    if (!installedAt || Number.isNaN(date.getTime()) || !days) return "";
    date.setDate(date.getDate() + days);
    return localDateTime(date);
}

function normalizeCustomer(customer) {
    const installedAt = toLocalDateTime(customer.installDate);
    const expiresAt = toLocalDateTime(customer.expiresAt || customer.dueDate) ||
        expiryDate(installedAt, customer.months);
    const packageHistory = Array.isArray(customer.packageHistory)
        ? customer.packageHistory.map((item, index) => ({
            ...item,
            id: item.id || `package-${customer.id}-${index}`,
            months: Number(item.months) || 1,
            fee: Number(item.fee) || 0,
            installedAt: toLocalDateTime(item.installedAt),
            expiresAt: toLocalDateTime(item.expiresAt || item.dueDate),
            status: item.status || customer.status || "Pending",
            paymentDate: item.paymentDate || ""
        }))
        : [{
            id: `initial-${customer.id}`,
            plan: customer.plan || "30 Mbps",
            months: Number(customer.months) || 1,
            fee: Number(customer.fee) || 0,
            installedAt,
            expiresAt,
            status: customer.status || "Pending",
            paymentDate: customer.paymentDate || ""
        }];

    return {
        ...customer,
        username: customer.username || "",
        months: Number(customer.months) || 1,
        fee: Number(customer.fee) || 0,
        installDate: installedAt,
        expiresAt,
        dueDate: expiresAt.slice(0, 10),
        paymentDate: customer.paymentDate || "",
        packageHistory
    };
}

function readCustomers() {
    try {
        const saved = localStorage.getItem(CUSTOMER_KEY);
        return (saved ? JSON.parse(saved) : demoCustomers).map(normalizeCustomer);
    } catch (error) {
        console.error("Could not load ISP customer data.", error);
        return demoCustomers.map(normalizeCustomer);
    }
}

let customers = readCustomers();
let payments;
try {
    const storedPayments = localStorage.getItem(PAYMENT_KEY);
    payments = storedPayments === null
        ? customers.flatMap((customer) => customer.packageHistory
            .filter((item) => item.status === "Paid" && (item.paymentDate || customer.paymentDate))
            .map((item, index) => ({
                id: `initial-${customer.id}-${item.id}-${index}`,
                customerId: customer.id,
                packageId: item.id,
                username: customer.username,
                customerName: customer.name,
                date: item.paymentDate || customer.paymentDate,
                amount: Number(item.fee)
            })))
        : JSON.parse(storedPayments);
} catch (error) {
    console.error("Could not load ISP payment history.", error);
    payments = [];
}
let editingId = null;
let installingId = null;

function saveData() {
    localStorage.setItem(CUSTOMER_KEY, JSON.stringify(customers));
    localStorage.setItem(PAYMENT_KEY, JSON.stringify(payments));
}

function escapeHtml(value) {
    const node = document.createElement("span");
    node.textContent = String(value == null ? "" : value);
    return node.innerHTML;
}

function money(value) {
    return `Rs. ${Number(value || 0).toLocaleString("en-IN")}`;
}

function dateTime(value) {
    if (!value) return "-";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? escapeHtml(value) : escapeHtml(date.toLocaleString());
}

function addPayment(customer, packageRecord) {
    const date = packageRecord.paymentDate || new Date().toISOString().slice(0, 10);
    packageRecord.paymentDate = date;
    customer.paymentDate = date;
    payments.push({
        id: `${packageRecord.id}-${Date.now()}`,
        customerId: customer.id,
        packageId: packageRecord.id,
        username: customer.username,
        customerName: customer.name,
        date,
        amount: Number(packageRecord.fee)
    });
}

function render() {
    const now = new Date();
    customers.forEach((customer) => {
        customer.packageHistory.forEach((item) => {
            if (item.status === "Pending" && item.expiresAt && new Date(item.expiresAt) < now) {
                item.status = "Overdue";
            }
        });
        const latest = customer.packageHistory[customer.packageHistory.length - 1];
        if (latest) {
            Object.assign(customer, {
                plan: latest.plan,
                months: latest.months,
                fee: latest.fee,
                status: latest.status,
                installDate: latest.installedAt,
                expiresAt: latest.expiresAt,
                dueDate: latest.expiresAt.slice(0, 10),
                paymentDate: latest.paymentDate
            });
        }
    });

    const paid = customers.filter((customer) => customer.status === "Paid");
    const unpaid = customers.filter((customer) => customer.status === "Pending");
    const overdue = customers.filter((customer) => customer.status === "Overdue");
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const yearKey = String(now.getFullYear());
    const packageRecords = customers.flatMap((customer) => customer.packageHistory);
    const revenue = (filter) => payments
        .filter((payment) => filter(String(payment.date || "")))
        .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);

    document.getElementById("customerCount").textContent = customers.length;
    document.getElementById("paidCount").textContent = paid.length;
    document.getElementById("unpaidCount").textContent = unpaid.length;
    document.getElementById("overdueCount").textContent = overdue.length;
    document.getElementById("monthlyRevenue").textContent = money(revenue((date) => date.startsWith(monthKey)));
    document.getElementById("yearlyRevenue").textContent = money(revenue((date) => date.startsWith(yearKey)));
    document.getElementById("totalRevenue").textContent = money(revenue(() => true));
    document.getElementById("unpaidAmount").textContent = money(packageRecords
        .filter((item) => item.status === "Pending").reduce((sum, item) => sum + Number(item.fee), 0));
    document.getElementById("overdueAmount").textContent = money(packageRecords
        .filter((item) => item.status === "Overdue").reduce((sum, item) => sum + Number(item.fee), 0));

    renderRecent();
    renderCustomers();
    renderBilling();
    renderPayments();
    saveData();
}

function renderRecent() {
    const rows = customers.slice(0, 5).map((customer) => `
        <tr>
            <td><strong>${escapeHtml(customer.name)}</strong><br><small>${escapeHtml(customer.username)}</small></td>
            <td>${escapeHtml(customer.plan)}</td>
            <td>${money(customer.fee)}</td>
            <td><span class="status status-${escapeHtml(customer.status.toLowerCase())}">${escapeHtml(customer.status)}</span></td>
            <td>${dateTime(customer.installDate)}</td>
            <td>${escapeHtml(customer.paymentDate || "-")}</td>
            <td>${dateTime(customer.expiresAt)}</td>
        </tr>`).join("");
    document.getElementById("recentCustomerRows").innerHTML =
        rows || '<tr><td class="empty" colspan="7">No customers yet</td></tr>';
}

function renderCustomers() {
    const search = document.getElementById("customerSearch").value.trim().toLowerCase();
    const status = document.getElementById("statusFilter").value;
    const filtered = customers.filter((customer) => {
        const matches = [customer.name, customer.phone, customer.username]
            .some((value) => String(value).toLowerCase().includes(search));
        return matches && (status === "all" || customer.status === status);
    });
    document.getElementById("customerRows").innerHTML = filtered.map((customer) => `
        <tr>
            <td>${escapeHtml(customer.username)}</td>
            <td><button class="customer-name-link" data-action="install-package" data-id="${escapeHtml(customer.id)}">${escapeHtml(customer.name)}</button></td>
            <td>${escapeHtml(customer.phone)}</td>
            <td>${escapeHtml(customer.plan)}</td>
            <td>${customer.months} month${customer.months === 1 ? "" : "s"}</td>
            <td>${money(customer.fee)}</td>
            <td><span class="status status-${escapeHtml(customer.status.toLowerCase())}">${escapeHtml(customer.status)}</span></td>
            <td>${dateTime(customer.installDate)}</td>
            <td>${escapeHtml(customer.paymentDate || "-")}</td>
            <td>${dateTime(customer.expiresAt)}</td>
            <td>
                <button class="action-button" data-action="edit" data-id="${escapeHtml(customer.id)}">Edit</button>
                <button class="action-button" data-action="install-package" data-id="${escapeHtml(customer.id)}">Install package</button>
                <button class="action-button danger" data-action="delete" data-id="${escapeHtml(customer.id)}">Delete</button>
            </td>
        </tr>`).join("") || '<tr><td class="empty" colspan="11">No matching customers</td></tr>';
}

function renderBilling() {
    const history = customers.flatMap((customer) =>
        customer.packageHistory.map((item) => ({ customer, item })))
        .sort((a, b) => b.item.installedAt.localeCompare(a.item.installedAt));
    document.getElementById("billingRows").innerHTML = history.map(({ customer, item }) => `
        <tr>
            <td>${escapeHtml(customer.username)}</td>
            <td><strong>${escapeHtml(customer.name)}</strong></td>
            <td>${escapeHtml(item.plan)}</td>
            <td>${item.months} month${item.months === 1 ? "" : "s"}</td>
            <td>${money(item.fee)}</td>
            <td>${dateTime(item.installedAt)}</td>
            <td>${dateTime(item.expiresAt)}</td>
            <td><span class="status status-${escapeHtml(item.status.toLowerCase())}">${escapeHtml(item.status)}</span></td>
            <td>
                ${item.status === "Paid" ? '<span class="positive">Paid</span>' :
                    `<button class="action-button" data-action="paid" data-id="${escapeHtml(customer.id)}" data-package-id="${escapeHtml(item.id)}">Mark paid</button>`}
                <button class="action-button danger" data-action="delete-package" data-id="${escapeHtml(customer.id)}" data-package-id="${escapeHtml(item.id)}">Delete</button>
            </td>
        </tr>`).join("") || '<tr><td class="empty" colspan="9">No package history yet</td></tr>';
}

function renderPayments() {
    const rows = [...payments].sort((a, b) => String(b.date).localeCompare(String(a.date)))
        .map((payment) => `
            <tr>
                <td>${escapeHtml(payment.username)}</td>
                <td><strong>${escapeHtml(payment.customerName)}</strong></td>
                <td>${escapeHtml(payment.date)}</td>
                <td>${money(payment.amount)}</td>
            </tr>`).join("");
    document.getElementById("paymentRows").innerHTML =
        rows || '<tr><td class="empty" colspan="4">No payments recorded yet</td></tr>';
}

function showView(name) {
    document.querySelectorAll(".view").forEach((view) => view.classList.remove("active"));
    document.querySelectorAll(".nav-item[data-view]").forEach((button) => button.classList.remove("active"));
    document.getElementById(`${name}View`).classList.add("active");
    document.querySelector(`.nav-item[data-view="${name}"]`).classList.add("active");
    document.getElementById("openCustomerModal").hidden = name !== "customers";
    document.getElementById("pageTitle").textContent =
        ({ dashboard: "Dashboard", customers: "Customers", billing: "Billing", payments: "Payment" })[name];
}

const customerModal = document.getElementById("customerModal");
const customerForm = document.getElementById("customerForm");
const initialFields = document.querySelector(".initial-package-fields");
const packageModal = document.getElementById("packageModal");
const packageForm = document.getElementById("packageForm");
const resetPinModal = document.getElementById("resetPinModal");
const resetPinForm = document.getElementById("resetPinForm");
const resetPinError = document.getElementById("resetPinError");

function refreshExpiry(form) {
    form.elements.expiresAtPreview.value = expiryDate(form.elements.installDate.value, form.elements.months.value);
}

function setInitialFields(enabled) {
    initialFields.hidden = !enabled;
    initialFields.querySelectorAll("input, select").forEach((field) => { field.disabled = !enabled; });
}

function openPackage(customer) {
    installingId = customer.id;
    packageForm.reset();
    packageForm.elements.plan.value = customer.plan;
    packageForm.elements.fee.value = customer.fee;
    packageForm.elements.months.value = String(customer.months);
    packageForm.elements.installDate.value = localDateTime();
    document.getElementById("packageCustomerName").textContent = customer.name;
    refreshExpiry(packageForm);
    packageModal.classList.add("open");
    packageModal.setAttribute("aria-hidden", "false");
}

document.querySelectorAll(".nav-item[data-view]").forEach((button) =>
    button.addEventListener("click", () => showView(button.dataset.view)));
document.querySelectorAll("[data-go]").forEach((button) =>
    button.addEventListener("click", () => showView(button.dataset.go)));

document.getElementById("openCustomerModal").addEventListener("click", () => {
    editingId = null;
    customerForm.reset();
    setInitialFields(true);
    document.getElementById("customerModalTitle").textContent = "Add customer";
    document.getElementById("saveCustomerButton").textContent = "Save customer";
    customerForm.elements.installDate.value = localDateTime();
    refreshExpiry(customerForm);
    customerModal.classList.add("open");
    customerModal.setAttribute("aria-hidden", "false");
});
document.getElementById("closeCustomerModal").addEventListener("click", () => {
    customerModal.classList.remove("open");
    customerModal.setAttribute("aria-hidden", "true");
    editingId = null;
    setInitialFields(true);
});
document.getElementById("closePackageModal").addEventListener("click", () => {
    packageModal.classList.remove("open");
    packageModal.setAttribute("aria-hidden", "true");
    installingId = null;
});
customerModal.addEventListener("click", (event) => {
    if (event.target === customerModal) document.getElementById("closeCustomerModal").click();
});
packageModal.addEventListener("click", (event) => {
    if (event.target === packageModal) document.getElementById("closePackageModal").click();
});

customerForm.elements.months.addEventListener("change", () => refreshExpiry(customerForm));
customerForm.elements.installDate.addEventListener("input", () => refreshExpiry(customerForm));
packageForm.elements.months.addEventListener("change", () => refreshExpiry(packageForm));
packageForm.elements.installDate.addEventListener("input", () => refreshExpiry(packageForm));
document.getElementById("customerSearch").addEventListener("input", renderCustomers);
document.getElementById("statusFilter").addEventListener("change", renderCustomers);

customerForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(customerForm);
    const name = data.get("name").trim();
    const username = data.get("username").trim();
    if (customers.some((customer) => customer.id !== editingId &&
        (customer.name.toLowerCase() === name.toLowerCase() ||
            customer.username.toLowerCase() === username.toLowerCase()))) {
        window.alert("Customer name and username must be unique.");
        return;
    }

    if (editingId) {
        const customer = customers.find((item) => item.id === editingId);
        Object.assign(customer, { name, username, phone: data.get("phone").trim() });
    } else {
        const installedAt = data.get("installDate");
        const months = Number(data.get("months"));
        const expiresAt = expiryDate(installedAt, months);
        const customer = {
            id: String(Date.now()), name, username, phone: data.get("phone").trim(),
            plan: data.get("plan"), months, fee: Number(data.get("fee")),
            status: data.get("status"), installDate: installedAt, expiresAt,
            dueDate: expiresAt.slice(0, 10), paymentDate: "", packageHistory: []
        };
        const item = {
            id: `${customer.id}-${Date.now()}`, plan: customer.plan, months, fee: customer.fee,
            installedAt, expiresAt, status: customer.status, paymentDate: ""
        };
        customer.packageHistory.push(item);
        customers.unshift(customer);
        if (item.status === "Paid") {
            item.paymentDate = data.get("paymentDate") || new Date().toISOString().slice(0, 10);
            addPayment(customer, item);
        }
    }
    saveData();
    customerModal.classList.remove("open");
    customerModal.setAttribute("aria-hidden", "true");
    setInitialFields(true);
    render();
});

packageForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const customer = customers.find((item) => item.id === installingId);
    if (!customer) return;
    const data = new FormData(packageForm);
    const installedAt = data.get("installDate");
    const months = Number(data.get("months"));
    const expiresAt = expiryDate(installedAt, months);
    const item = {
        id: `${customer.id}-${Date.now()}`, plan: data.get("plan"), months,
        fee: Number(data.get("fee")), installedAt, expiresAt,
        status: data.get("status"), paymentDate: ""
    };
    customer.packageHistory.push(item);
    Object.assign(customer, {
        plan: item.plan, months, fee: item.fee, status: item.status,
        installDate: installedAt, expiresAt, dueDate: expiresAt.slice(0, 10), paymentDate: ""
    });
    if (item.status === "Paid") {
        item.paymentDate = data.get("paymentDate") || new Date().toISOString().slice(0, 10);
        addPayment(customer, item);
    }
    saveData();
    packageModal.classList.remove("open");
    packageModal.setAttribute("aria-hidden", "true");
    installingId = null;
    render();
});

document.addEventListener("click", (event) => {
    const statusCard = event.target.closest("[data-customer-status]");
    if (statusCard) {
        document.getElementById("customerSearch").value = "";
        document.getElementById("statusFilter").value = statusCard.dataset.customerStatus;
        renderCustomers();
        showView("customers");
        return;
    }
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const customer = customers.find((item) => item.id === button.dataset.id);
    if (!customer) return;
    if (button.dataset.action === "install-package") {
        openPackage(customer);
    } else if (button.dataset.action === "edit") {
        editingId = customer.id;
        customerForm.reset();
        setInitialFields(false);
        document.getElementById("customerModalTitle").textContent = "Edit customer";
        document.getElementById("saveCustomerButton").textContent = "Save changes";
        customerForm.elements.name.value = customer.name;
        customerForm.elements.username.value = customer.username;
        customerForm.elements.phone.value = customer.phone;
        customerModal.classList.add("open");
        customerModal.setAttribute("aria-hidden", "false");
    } else if (button.dataset.action === "delete") {
        if (!window.confirm(`Delete ${customer.name} and package history?`)) return;
        customers = customers.filter((item) => item.id !== customer.id);
        payments = payments.filter((payment) => payment.customerId !== customer.id);
    } else if (button.dataset.action === "delete-package") {
        const packageRecord = customer.packageHistory.find((item) => item.id === button.dataset.packageId);
        if (!packageRecord || !window.confirm(`Delete the ${packageRecord.plan} package for ${customer.name}?`)) return;
        customer.packageHistory = customer.packageHistory.filter((item) => item.id !== packageRecord.id);
        payments = payments.filter((payment) => {
            if (payment.customerId !== customer.id) return true;
            const paymentId = String(payment.id || "");
            return payment.packageId !== packageRecord.id &&
                !paymentId.startsWith(`${packageRecord.id}-`) &&
                !paymentId.startsWith(`initial-${customer.id}-${packageRecord.id}-`);
        });
        if (customer.packageHistory.length === 0) {
            Object.assign(customer, {
                plan: "",
                months: 1,
                fee: 0,
                status: "Pending",
                installDate: "",
                expiresAt: "",
                dueDate: "",
                paymentDate: ""
            });
        }
    } else if (button.dataset.action === "paid") {
        const item = customer.packageHistory.find((record) => record.id === button.dataset.packageId);
        if (!item || item.status === "Paid") return;
        item.status = "Paid";
        item.paymentDate = new Date().toISOString().slice(0, 10);
        if (customer.packageHistory[customer.packageHistory.length - 1] === item) {
            customer.status = "Paid";
            customer.paymentDate = item.paymentDate;
        }
        addPayment(customer, item);
    }
    saveData();
    render();
});

function closeResetPinModal() {
    resetPinModal.classList.remove("open");
    resetPinModal.setAttribute("aria-hidden", "true");
}

document.getElementById("resetData").addEventListener("click", () => {
    resetPinForm.reset();
    resetPinError.textContent = "";
    resetPinModal.classList.add("open");
    resetPinModal.setAttribute("aria-hidden", "false");
    resetPinForm.elements.pin.focus();
});
document.getElementById("closeResetPinModal").addEventListener("click", closeResetPinModal);
resetPinModal.addEventListener("click", (event) => {
    if (event.target === resetPinModal) closeResetPinModal();
});
resetPinForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (resetPinForm.elements.pin.value !== RESET_PIN) {
        resetPinError.textContent = "Incorrect PIN. Data was not reset.";
        resetPinForm.elements.pin.focus();
        return;
    }
    closeResetPinModal();
    if (!window.confirm("Reset all customer and payment data? This cannot be undone.")) return;
    if (!window.confirm("Confirm again to permanently erase all customer and payment data.")) return;
    customers = [];
    payments = [];
    saveData();
    render();
});

document.getElementById("today").textContent = new Intl.DateTimeFormat("en-IN", {
    weekday: "long", day: "numeric", month: "long", year: "numeric"
}).format(new Date());

render();
if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(console.error));
}
