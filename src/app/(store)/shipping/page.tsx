import { PolicyPage, policyMetadata } from "@/components/store/policy-page";

export const generateMetadata = () => policyMetadata("shipping");

export default function Page() {
  return <PolicyPage slug="shipping" />;
}
