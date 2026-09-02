import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { Alert } from './alert';

describe('Alert component', () => {
  it('renders alert message and title', () => {
    render(<Alert variant="error" title="Error Title">An error occurred</Alert>);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Error Title')).toBeInTheDocument();
    expect(screen.getByText('An error occurred')).toBeInTheDocument();
  });
});
