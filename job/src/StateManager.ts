import { EventEmitter } from 'events';
import { WorkerState } from './types/WorkerState';
import { logUserEvent } from "./logger";

/**
 * Manages the state of a worker process
 */
export class StateManager {
  private currentState: WorkerState;
  private stateMetadata: any;
  private readonly workerId: number;
  private readonly eventEmitter: EventEmitter;

  constructor(workerId: number, eventEmitter: EventEmitter) {
    this.workerId = workerId;
    this.eventEmitter = eventEmitter;
    this.currentState = WorkerState.INITIALIZING;
    this.stateMetadata = null;
  }

  /**
   * Set the current state of the worker
   * @param newState - The new state to set
   * @param metadata - Optional metadata associated with the state change
   */
  public setState(newState: WorkerState, metadata?: any): void {
    const previousState = this.currentState;

    logUserEvent(`Воркер ${this.workerId} сменил состояние: ${previousState} -> ${newState}`)

    this.currentState = newState;
    this.stateMetadata = metadata || null;

    // Emit state change event
    this.eventEmitter.emit('stateChange', newState, this.stateMetadata);
  }

  /**
   * Get the current state of the worker
   * @returns The current state
   */
  public getState(): WorkerState {
    return this.currentState;
  }

  /**
   * Check if the worker is in the specified state
   * @param state - The state to check against
   * @returns True if the worker is in the specified state
   */
  public isInState(state: WorkerState): boolean {
    return this.currentState === state;
  }
}