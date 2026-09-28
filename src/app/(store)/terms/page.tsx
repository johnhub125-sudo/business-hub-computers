import { PolicyPage, policyMetadata } from "@/components/store/policy-page";

export const generateMetadata = () => policyMetadata("terms");

export default function Page() {
  return <PolicyPage slug="terms" />;
}
