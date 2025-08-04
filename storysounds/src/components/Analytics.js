import { useEffect } from 'react';
import { initGA } from '../utils/analytics';

const Analytics = () => {
  useEffect(() => {
    // Initialize Google Analytics when component mounts
    initGA();
  }, []);

  return null; // This component doesn't render anything
};

export default Analytics;

