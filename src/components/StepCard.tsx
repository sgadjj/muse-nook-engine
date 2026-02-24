import { ReactNode } from "react";

interface StepCardProps {
  step: number;
  title: string;
  children: ReactNode;
}

const StepCard = ({ step, title, children }: StepCardProps) => {
  return (
    <div className="flex gap-4 items-start">
      <div className="flex-shrink-0 w-10 h-10 rounded-full gradient-main flex items-center justify-center text-primary-foreground font-bold text-sm shadow-glow">
        {step}
      </div>
      <div className="flex-1 pt-1">
        <h3 className="text-lg font-semibold text-foreground mb-2">{title}</h3>
        <div className="text-muted-foreground leading-relaxed">{children}</div>
      </div>
    </div>
  );
};

export default StepCard;
