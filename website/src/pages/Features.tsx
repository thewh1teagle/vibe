import FeatureCard from '~/components/FeatureCard'
import features from '~/lib/features.json'

export default function Features() {
  return (
    <div className="m-auto max-w-[81%] lg:max-w-[680px]" dir="ltr">
      <div className="text-4xl font-bold">Features</div>
      <div className="mt-14 flex flex-col gap-28">
        {features.map((feature) => (
          <FeatureCard key={feature.title} {...feature} />
        ))}
      </div>
    </div>
  )
}
