// In-memory discount store (replace with database in production)
let discounts = [
  {
    id: 1,
    title: "Summer Sale 2024",
    type: "percentage",
    value: 20,
    status: "active",
    created: "Dec 10, 2024",
    usage: "45 / 100",
  },
  {
    id: 2,
    title: "Buy 2 Get 1 Free",
    type: "bogo",
    value: "1 free",
    status: "active",
    created: "Dec 8, 2024",
    usage: "120 / Unlimited",
  },
  {
    id: 3,
    title: "New Year Promo",
    type: "fixed",
    value: 500,
    status: "scheduled",
    created: "Dec 5, 2024",
    usage: "0 / 200",
  },
];

export function getAllDiscounts() {
  return [...discounts];
}

export function getActiveDiscounts() {
  return discounts.filter((d) => d.status === "active");
}

export function setDiscounts(newDiscounts) {
  discounts = [...newDiscounts];
}

export function addDiscount(discount) {
  discounts.push(discount);
}

export function updateDiscount(id, updates) {
  const index = discounts.findIndex((d) => d.id === id);
  if (index !== -1) {
    discounts[index] = { ...discounts[index], ...updates };
  }
}

export function deleteDiscount(id) {
  discounts = discounts.filter((d) => d.id !== id);
}
