import { PolicyPage, policyMetadata } from "@/components/store/policy-page";

export const generateMetadata = () => policyMetadata("refund-policy");

export default function Page() {
  return <PolicyPage slug="refund-policy" />;
}
