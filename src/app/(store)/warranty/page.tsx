import { PolicyPage, policyMetadata } from "@/components/store/policy-page";

export const generateMetadata = () => policyMetadata("warranty");

export default function Page() {
  return <PolicyPage slug="warranty" />;
}
