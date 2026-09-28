import { PolicyPage, policyMetadata } from "@/components/store/policy-page";

export const generateMetadata = () => policyMetadata("returns");

export default function Page() {
  return <PolicyPage slug="returns" />;
}
