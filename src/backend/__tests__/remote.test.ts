jest.mock('../config', () => ({
  supabaseUrl: '',
  supabaseAnonKey: '',
  remoteEnabled: false,
}));

jest.mock('../client', () => ({
  supabase: { functions: { invoke: jest.fn() }, auth: {} },
}));

import { stateForNewNode } from '../remote';

describe('stateForNewNode', () => {
  test('opens an empty operating record with the node manager as the sole approver', () => {
    const state = stateForNewNode('Ama Owusu');
    expect(state.orders).toEqual([]);
    expect(state.farmers).toEqual([]);
    expect(state.products.length).toBeGreaterThan(0);
    expect(state.opsUsers).toEqual([
      { id: 'OU-1', name: 'Ama Owusu', title: 'Node manager', approver: true },
    ]);
    expect(state.config.approverIds).toEqual(['OU-1']);
    expect(state.session.opsUserId).toBe('OU-1');
  });

  test('falls back to a generic name when the profile has none', () => {
    expect(stateForNewNode('').opsUsers[0].name).toBe('Node manager');
  });
});
